# PROJECT RECAP - IPD Data Management System

> **Living Document** - Updated as we discover and fix issues
> 
> Last Updated: January 16, 2026

---

## 📊 VISUAL DATA FLOW DIAGRAMS

**NEW:** Complete Mermaid diagrams showing actual system architecture!

👉 **[DATA_FLOWS_MERMAID.md](DATA_FLOWS_MERMAID.md)** - Comprehensive visual diagrams including:
- Actual Data Flow (Oracle → fp_raw_data → fp_actualcommon → UI)
- Budget Data Flow - Sales Rep (HTML export/import workflow)
- Budget Data Flow - Divisional (Live editing with draft/approved states)
- Product Group Pricing Flow (Materialized view and calculations)
- Division Architecture (Oracle code mapping)
- Complete System Overview (All components and interactions)
- Old vs. New System Comparison
- Implementation Status (What's done vs. pending)

---

## 🏢 DIVISION ARCHITECTURE (FULLY DYNAMIC - NO HARDCODED NAMES)

### Division Mapping System

The system supports **fully dynamic division mappings** - all division codes and names come from the `company_divisions` table. If a user renames "FP" to "FlexPack" in Company Settings, the change reflects everywhere automatically.

**⚠️ CRITICAL: NO HARDCODED DIVISIONS**
- Division names are NEVER hardcoded in code
- All validation uses `divisionValidator.js` which queries `company_divisions` table
- If admin renames or adds divisions in Company Settings, system adapts automatically
- Old code with hardcoded checks like `['fp', 'sb', 'tf', 'hcm'].includes()` has been replaced

**Configuration Location**: `ip_auth_database.company_divisions`

**Current Mapping (as of Jan 10, 2026)**:
```
Admin Division: FP (Flexible Packaging)
  ├─ Oracle Division: FP
  └─ Oracle Division: BF
  Result: FP division shows combined data from Oracle FP + BF

(Only one division currently configured)
```

**Key Tables**:
1. `company_divisions` - Division definitions with Oracle code mappings
   ```sql
   division_code VARCHAR(20)         -- Admin code (FP, HC)
   division_name VARCHAR(255)        -- Display name
   mapped_oracle_codes TEXT[]        -- Oracle codes ['FP', 'FB']
   is_active BOOLEAN                 -- Soft delete flag
   ```

2. `fp_actualcommon.division_code` - Stores **Oracle** division code (FP, FB, HC, etc.)
   - NOT the admin division code
   - Used for filtering: WHERE division_code = ANY(['FP', 'FB'])

**Helper Service**: `server/database/divisionOracleMapping.js`
- `getDivisionOracleCodes('FP')` → Returns `['FP', 'FB']`
- Cached for 5 minutes for performance
- Falls back to just the division code if mapping not found

**Migration**: `321_enhanced_company_divisions_with_oracle_mapping.sql`
- Creates company_divisions table
- Seeds default FP→[FP,BF] mapping (HC was removed - hardcoded mistake)

---

## 📊 DATA FLOW ARCHITECTURE

### Overview Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           ORACLE ERP DATABASE                              │
│                    HAP111.XL_FPSALESVSCOST_FULL                            │
│                         (57 columns, ~50K rows)                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Manual Export to Excel
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    EXCEL FILE (Oracle Export)                              │
│           server/data/FPSALESVSCOST_FULL.xlsx                              │
│                  Sheet: XL_FPSALESVSCOST_FULL                              │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ "Sync from Oracle" Button
                                    │ Calls: POST /api/fp/sync-oracle-excel
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     IMPORT SCRIPT                                          │
│                import-excel-to-raw-fast.js                                 │
│                                                                            │
│  1. DISABLE trigger (after_fp_raw_data_change)                             │
│  2. Reads Excel with XLSX library                                          │
│  3. Batch INSERT 500 rows at a time                                        │
│  4. Shows progress: 📊 45.2% | 22,850/50,529 rows                          │
│  5. RE-ENABLE trigger                                                      │
│  6. Run sync_raw_to_actualcommon() ONCE                                    │
│  Modes: "replace-all" or "update-year"                                     │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Direct INSERT
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    LAYER 1: fp_raw_data                                    │
│                    (RAW Oracle Data)                                       │
│                                                                            │
│  Columns (57 from Oracle + 3 metadata):                                    │
│  ┌──────────────────┬───────────────────┬──────────────────┐               │
│  │ division         │ customername      │ salesrepname     │               │
│  │ subdivision      │ countryname       │ salesrepcode     │               │
│  │ year1            │ productgroup      │ invoicedamount   │               │
│  │ monthno          │ itemcode          │ deliveredqtykgs  │               │
│  │ invoicedate      │ itemdescription   │ marginoverrm     │               │
│  └──────────────────┴───────────────────┴──────────────────┘               │
│                                                                            │
│  ⚠️ Data stored EXACTLY as Oracle (mostly UPPERCASE)                       │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ TRIGGER: after_fp_raw_data_change
                                    │ Calls: sync_raw_to_actualcommon()
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    LAYER 2: fp_actualcommon                                │
│                    (Transformed & Unified Data)                            │
│                                                                            │
│  Purpose:                                                                  │
│  • Cleaner column names (customer_name vs customername)                    │
│  • Joined with divisions table for division_name                           │
│  • Product groups mapped via fp_raw_product_groups                         │
│  • ✅ ALL TEXT FIELDS IN PROPER CASE (INITCAP applied)                     │
│  • Sales rep groups looked up from sales_rep_group_members                 │
│  • ✅ DENORMALIZED admin_division_code for simpler queries                  │
│                                                                            │
│  Key Columns:                                                              │
│  ┌──────────────────────────┬───────────────────┬──────────────────┐       │
│  │ division_code (Oracle)   │ customer_name     │ sales_rep_name   │       │
│  │ admin_division_code ⭐   │ country           │ sales_rep_code   │       │
│  │ division_name            │ product_group     │ amount           │       │
│  │ year                     │ pgcombine         │ qty_kgs          │       │
│  │ month_no                 │ item_desc         │ morm             │       │
│  └──────────────────────────┴───────────────────┴──────────────────┘       │
│                                                                            │
│  ⭐ admin_division_code: Maps Oracle codes (FP, BF) to admin division (FP)  │
│     Denormalized from company_divisions for query simplicity              │
│                                                                            │
│  Total: 70+ columns with unified naming                                    │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ API Queries
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND UI                                        │
│              src/components/MasterData/AEBF/ActualTab.jsx                  │
│                                                                            │
│  Features:                                                                 │
│  • Year tabs (2019-2026)                                                   │
│  • Summary cards: AMOUNT, KGS, MORM                                        │
│  • Global search across all fields                                         │
│  • Export to Excel                                                         │
│  • Sync from Oracle button with progress indicator                         │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 KEY COMPONENTS

### 1. Import Script
**File:** `import-excel-to-raw.js`

```javascript
// Reads Excel and inserts to fp_raw_data
// Supports two modes:
// - replace-all: Truncates and reloads all data
// - update-year: Only updates specific year
```

### 2. Sync Function
**PostgreSQL Function:** `sync_raw_to_actualcommon()`

```sql
-- Transforms fp_raw_data → fp_actualcommon
-- Applies INITCAP for Proper Case formatting
-- Joins with divisions table
-- Looks up product group mappings
-- Assigns sales rep groups
```

### 3. Auto-Sync Trigger
**Trigger:** `after_fp_raw_data_change`

```sql
-- Fires AFTER INSERT, UPDATE, DELETE on fp_raw_data
-- Automatically calls sync_raw_to_actualcommon()
-- Ensures fp_actualcommon is always in sync
```

---

## 📋 API ENDPOINTS

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fp/raw-data/years` | GET | Get available years from data |
| `/api/fp/raw-data/year-summary` | GET | Get AMOUNT/KGS/MORM totals |
| `/api/fp/raw-data/export` | GET | Export data to Excel |
| `/api/fp/sync-oracle-excel` | POST | Trigger sync from Oracle |
| `/api/fp/sync-oracle-excel/progress` | GET (SSE) | Real-time sync progress |

---

## 🏗️ ARCHITECTURE IMPROVEMENTS

### Admin Division Denormalization (Migration 322-323)
**Date:** January 10, 2026  
**Problem:** 
- Queries used complex array filtering: `WHERE division_code = ANY(['FP', 'BF']::text[])`
- Depended on `company_divisions` mapping service
- Tight coupling between queries and division mapping logic
- Performance impact from array operations

**Solution:**
Added `admin_division_code` column to both `fp_actualcommon` and `fp_budget_unified`:
- Denormalized from `company_divisions` mapping
- Single, indexed column lookup instead of array filtering
- No service dependency - data is self-contained
- Query simplification: `WHERE admin_division_code = 'FP'`
- Better performance with indexed column

**Changes:**
1. Migration 322: Added `admin_division_code` to `fp_actualcommon`
2. Migration 323: Added `admin_division_code` to `fp_budget_unified`
3. Script: `populate-admin-division-code.js` - Populates both tables from `company_divisions`
4. Updated all queries in `divisional.js` and `universal.js` to use new column
5. Removed dependency on `divisionOracleMapping.js` from queries

**Example Query Before:**
```sql
WHERE UPPER(a.division_code) = ANY(['FP', 'BF']::text[])
```

**Example Query After:**
```sql
WHERE UPPER(a.admin_division_code) = UPPER('FP')
```

**Benefits:**
✅ Simpler queries  
✅ Better performance (indexed column)  
✅ Single source of truth in data  
✅ No service dependency  
✅ Easier to audit and maintain  

---

## ✅ FIXES APPLIED

### Fix #8: AEBF Console Errors - Services Charges Duplication & Database Schema Issues
**Date:** January 10, 2026  
**Issue:** Multiple 500 errors in browser console after division validator changes:
1. Services Charges appearing twice in AEBF Divisional Budget (once in tableData, once separate)
2. Column error: `rpg.raw_product_group` does not exist
3. View error: `vw_unified_sales_complete` does not exist
4. Product groups endpoint failing due to empty mapping table

**Root Causes:**
1. **Services Charges Duplication**: Main query included Services Charges AND it was fetched separately
2. **Wrong View Name**: Code referenced non-existent view `vw_unified_sales_complete` (actual: `vw_unified_sales_data`)
3. **Wrong Column Reference**: Used `rpg.raw_product_group` but column is `rpg.product_group`
4. **Architectural Issue**: `/api/product-groups-universal` endpoint relied on `fp_raw_product_groups` mapping table which was empty (0 rows)

**Solutions Applied:**

**1. Services Charges Duplication Fix** (server/routes/aebf/divisional.js)
- Added exclusion filter to main product groups query: `AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'`
- Applied to AMOUNT, KGS, and MORM sections
- Services Charges now only appears in `servicesChargesData`, not in `tableData`
- ✅ Tested: Confirmed no duplication

**2. View Name Correction** (27 replacements across 7 files)
- Changed `vw_unified_sales_complete` → `vw_unified_sales_data` in:
  - server/database/UniversalSalesByCountryService.js (4 occurrences)
  - server/index.js (4 occurrences - warm-up queries)
  - server/routes/salesReps.js (1 occurrence)
  - server/routes/unified.js (3 occurrences)
  - server/routes/universal.js (1 occurrence)
  - server/routes/divisionMergeRules.js (7 occurrences)
  - server/routes/database.js (6 occurrences)

**3. Column Reference Fix**
- Changed `rpg.raw_product_groups` → `rpg.product_group` in:
  - server/services/productGroupService.js (buildResolutionJoins)
  - server/services/DataFilteringHelper.js
- Note: `raw_product_groups` is ARRAY type, `product_group` is VARCHAR

**4. Product Groups Architecture Simplification** (server/routes/universal.js)
- **Problem**: Endpoint used complex `productGroupService.getAllProductGroups()` which relied on empty `fp_raw_product_groups` mapping table
- **Discovery**: Mapping table intended for name standardization but unnecessary - `actualcommon.pgcombine` already has clean values
- **Best Practice**: Working divisional endpoint queries directly from `fp_actualcommon.pgcombine` with exclusions
- **Solution**: Replaced service call with direct SQL query pattern:
  ```sql
  SELECT DISTINCT pgcombine
  FROM fp_actualcommon a
  LEFT JOIN fp_product_group_exclusions e
    ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
    AND UPPER(e.division_code) = UPPER($1)
  WHERE UPPER(a.division_code) = ANY($2::text[])
    AND a.pgcombine IS NOT NULL
    AND TRIM(a.pgcombine) != ''
    AND e.product_group IS NULL
  ```
- Handles both all product groups and sales rep-specific filtering
- No longer depends on mapping table

**Files Modified:**
- server/routes/aebf/divisional.js - Services Charges exclusion
- server/routes/universal.js - Direct query implementation
- server/database/UniversalSalesByCountryService.js - View name
- server/index.js - View name
- server/routes/salesReps.js - View name
- server/routes/unified.js - View name
- server/routes/divisionMergeRules.js - View name
- server/routes/database.js - View name
- server/services/productGroupService.js - Column reference
- server/services/DataFilteringHelper.js - Column reference

**Impact:**
- All console 500 errors resolved
- Services Charges displays correctly (once, not duplicated)
- Product groups dropdown populates correctly
- Simplified architecture - removed dependency on empty mapping table
- System follows consistent pattern: direct queries from source data

---

### Fix #1: Proper Case (INITCAP) Transformation
**Date:** January 10, 2026
**Issue:** Data came from Oracle in UPPERCASE, causing case-sensitive lookup issues
**Solution:** Modified `sync_raw_to_actualcommon()` to apply `INITCAP()` to all text fields

**Before → After Examples:**
```
fp_raw_data (ORIGINAL):              fp_actualcommon (TRANSFORMED):
───────────────────────────────────────────────────────────────────
050TELECOM (MOBILE SOLUTIONS)    →   050telecom (Mobile Solutions)
ABC BEVERAGES                    →   Abc Beverages
UNITED ARAB EMIRATES             →   United Arab Emirates
SHRINK FILM PLAIN                →   Shrink Film Plain
DINAH GANTALAO CUEVAS            →   Dinah Gantalao Cuevas
```

**Fields Transformed to Proper Case:**
| Field | Transformation | Example |
|-------|----------------|---------|
| `customer_name` | INITCAP | "ABC BEVERAGES" → "Abc Beverages" |
| `customer_title` | INITCAP | "MR." → "Mr." |
| `country` | INITCAP | "UNITED ARAB EMIRATES" → "United Arab Emirates" |
| `sales_rep_name` | INITCAP | "JOHN DOE" → "John Doe" |
| `contact_name` | INITCAP | "JANE SMITH" → "Jane Smith" |
| `product_group` | INITCAP | "SHRINK FILM PLAIN" → "Shrink Film Plain" |
| `item_desc` | INITCAP | "PRINTED BAG 20X30" → "Printed Bag 20X30" |

**Fields Kept UPPERCASE (Codes):**
- `division_code`, `customer_code`, `item_code`, `item_group_code`
- `sales_rep_code`, `selection_code`, `title_code`, `payment_code`

**Special Transformations:**
- `contact_email` → LOWERCASE (emails should be lowercase)

---

### Fix #2: Fast Import (Trigger Bypass)
**Date:** January 10, 2026
**Issue:** "Sync from Oracle" was running at 3 rows/sec (4.5 hours for 50K rows!)
**Root Cause:** Trigger `after_fp_raw_data_change` was firing after EVERY row insert, running sync_raw_to_actualcommon() 50,000+ times

**Solution:** Created `import-excel-to-raw-fast.js` that:
1. **DISABLES** the trigger before import
2. Imports all rows using batch INSERTs (500 rows at a time)
3. **RE-ENABLES** the trigger after import
4. Runs `sync_raw_to_actualcommon()` **ONCE** at the end

**Performance Improvement:**
| Metric | Before | After |
|--------|--------|-------|
| Speed | 3 rows/sec | 1,500 rows/sec |
| Time for 50K rows | ~4.5 hours | ~50 seconds |
| Trigger calls | 50,000+ | 1 |

**Files Modified:**
- `server/routes/fp.js` (lines ~1090 and ~1175) - Changed to use fast import script
- `import-excel-to-raw-fast.js` - New optimized import script

---

### Fix #3: AEBF Division Oracle Mapping (FP = FP + FB)
**Date:** January 10, 2026
**Issue:** AEBF Divisional Budget page only showed 6 product groups instead of 14 when viewing FP division
**Root Cause:** 
- Oracle has two divisions: **FP** and **BF** (Flexible Packaging)
- Admin wants one division **FP** that combines both Oracle FP + BF
- AEBF query was filtering by `WHERE division_code = 'FP'` (only Oracle FP)
- This excluded all Oracle **BF** data (Commercial Items, Industrial Items, Shrink Films, Wide Film)

**Database Reality:**
```sql
-- fp_actualcommon.division_code column contains ORACLE division codes
SELECT DISTINCT division_code, COUNT(*) FROM fp_actualcommon WHERE year=2025 GROUP BY 1;
 division_code | count 
───────────────┼───────
 FP            | 2,307   (Labels, Laminates, Mono Layer, Others, Services, Shrink Sleeves)
 BF            | 4,174   (Commercial Plain/Printed, Industrial Plain/Printed, Shrink Films, Wide Film)
```

**Solution Applied:**
1. Created `company_divisions` table with Oracle code mappings
   ```sql
   INSERT INTO company_divisions (division_code, division_name, mapped_oracle_codes)
   VALUES ('FP', 'Flexible Packaging', ARRAY['FP', 'BF']);
   ```

2. Created helper service `server/database/divisionOracleMapping.js`
   ```javascript
   getDivisionOracleCodes('FP') → Returns ['FP', 'BF']
   ```

3. Updated AEBF queries from:
   ```sql
   WHERE division_code = $1  -- Only gets Oracle FP
   ```
   To:
   ```sql
   WHERE division_code = ANY($2::text[])  -- Gets Oracle FP + BF
   ```

4. Updated API to dynamically resolve mappings:
   ```javascript
   const oracleCodes = await getDivisionOracleCodes('FP'); // Returns ['FP', 'BF']
   await query(sql, [adminDivision, oracleCodes, year]);
   ```

**Product Groups Now Showing (14 total, 1 excluded):**
| Oracle Division | Product Groups | 2025 Records |
|----------------|----------------|--------------|
| FP | Labels, Laminates, Mono Layer Printed, Others, Services Charges, Shrink Sleeves | 2,307 |
| BF | Commercial Items Plain, Commercial Items Printed, Industrial Items Plain, Industrial Items Printed, Shrink Film Plain, Shrink Film Printed, Wide Film, Others | 4,174 |
| ~~FP~~ | ~~Raw Materials~~ (Excluded via fp_product_group_exclusions) | ~~19~~ |
| **Total** | **13 visible + 1 excluded = 14 product groups** | **6,481** |

**📌 Note About Divisions:** Divisions are **dynamically managed** from Company Info settings (not hardcoded). The system reads division mappings from `company_divisions` table in `ip_auth_database`. Currently only **FP** division exists, configured to aggregate Oracle **FP + BF** codes. The migration initially included a hardcoded HC division (mistake) which has been removed.

**Files Changed:**
- Created: `server/database/divisionOracleMapping.js`
- Created: `server/migrations/321_enhanced_company_divisions_with_oracle_mapping.sql`
- Applied Migration 321 to create company_divisions table in ip_auth_database
- Modified: `server/routes/aebf/divisional.js` (added getDivisionOracleCodes, changed WHERE clause in 3 queries)
- Modified: `PROJECT_RECAP.md` (added Division Architecture section at top)

**Performance Notes:**
- Division mappings cached for 5 minutes to avoid repeated DB queries
- Falls back gracefully to just the admin code if mapping lookup fails
- Query uses PostgreSQL's ANY() operator for efficient array matching

**⚠️ RESTART REQUIRED:** After these changes, run `START-SERVERS.cmd` to restart the backend server for the division mapping changes to take effect.

---

## 📊 RELATED TABLES

### Master Data Tables
| Table | Purpose |
|-------|---------|
| `divisions` | Division names and raw_divisions mapping |
| `country_master` | Country standardization |
| `fp_raw_product_groups` | Product group consolidation/mapping |
| `sales_rep_master` | Sales rep registration |
| `sales_rep_groups` | Sales rep groupings |
| `sales_rep_group_members` | Group membership |
| `customer_master` | Customer standardization |

### Data Tables
| Table | Purpose |
|-------|---------|
| `fp_raw_data` | Raw Oracle data (Layer 1) |
| `fp_actualcommon` | Transformed actual data (Layer 2) |
| `fp_budget_unified` | Budget data |
| `fp_estimate_unified` | Estimate data |
| `fp_forecast_unified` | Forecast data |

---

## � PRODUCT GROUPS SYSTEM

### Architecture Overview

The Product Groups system in Master Data Management consists of **3 sub-pages** managing different aspects of product group data:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     PRODUCT GROUPS TAB (Master Data)                         │
│                     Component: ProductGroupMasterData.jsx                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
       ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
       │ Raw Product    │  │ Material       │  │ Product Group  │
       │ Groups         │  │ Percentages    │  │ Pricing        │
       └────────────────┘  └────────────────┘  └────────────────┘
```

### 1. Raw Product Groups (RawProductGroups.jsx)

**Purpose:** Maps raw product group names from data sources → standardized PGCombine values

**Key Features:**
- View distinct raw product groups from actual data (fp_actualcommon)
- Map each raw product group to a PGCombine (standardized name)
- Mark groups as "unmapped" if not yet categorized
- Individual Item Group Description overrides (item-level remapping)

**Database Tables:**
| Table | Location | Records | Purpose |
|-------|----------|---------|---------|
| `raw_product_group_mappings` | ip_auth_database | ~15 | Master mappings: raw_product_group → pg_combine |
| `fp_item_group_overrides` | fp_database | varies | Override mappings for specific item descriptions |
| `fp_actualcommon` | fp_database | 54,203 | Source of raw product group names |

**Flow:**
1. User sees all raw product group names from `fp_actualcommon`
2. User types PGCombine name for each raw group
3. Saves to `raw_product_group_mappings` (auth database)
4. Unique PGCombine values auto-sync to Material Percentages tab

---

### 2. Material Percentages (MaterialPercentageManager.jsx)

**Purpose:** Define material composition (PE, BOPP, PET, etc.) for each PGCombine

**Key Features:**
- Dynamic material columns (loaded from `material_column_config`)
- Material/Process assignment for each product group
- Add/remove/rename material columns
- Material percentages must sum to 100%
- Syncs with pricing data

**Database Tables:**
| Table | Location | Records | Purpose |
|-------|----------|---------|---------|
| `fp_product_group_master` | fp_database | ~14 | Main table with material % columns + pricing |
| `material_column_config` | ip_auth_database | 32 | Defines dynamic material columns (PE, BOPP, PET, etc.) |
| `material_config` | ip_auth_database | 0 | Material type definitions (currently unused) |
| `material_group_config` | ip_auth_database | varies | Material grouping (for categorization) |
| `material_condition_config` | ip_auth_database | varies | Material conditions |

**Dynamic Columns:**
The system uses ALTER TABLE to add/remove material percentage columns dynamically:
- Column pattern: `{material_code}_percentage` (e.g., `pe_percentage`, `bopp_percentage`)
- Material columns are division-specific (fp, sb, tf, hcm)
- Display names are configurable (e.g., "PE" → "Polyethylene")

**Table Structure (fp_product_group_master):**
```sql
product_group       VARCHAR   -- PGCombine name (e.g., "Shrink Film Plain")
pe_percentage       NUMERIC   -- Dynamic material columns
bopp_percentage     NUMERIC   --   ↓
pet_percentage      NUMERIC   --   added/removed via ALTER TABLE
alu_percentage      NUMERIC   --   ↓
paper_percentage    NUMERIC   -- Based on material_column_config
pvc_pet_percentage  NUMERIC   --
mix_percentage      NUMERIC   --
material            VARCHAR   -- Material type (e.g., "PE", "BOPP")
process             VARCHAR   -- Process type (e.g., "Extrusion", "Printing")
asp_actual          NUMERIC   -- Calculated from fp_actualcommon
morm_actual         NUMERIC   --   ↓
rm_actual           NUMERIC   -- Auto-calculated pricing actuals
actual_year         INTEGER   --
actual_last_calculated_at  TIMESTAMP
asp_round           NUMERIC   -- User-entered rounded pricing
morm_round          NUMERIC   --   ↓
rm_round            NUMERIC   -- For budget/planning
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

---

### 3. Product Group Pricing (ProductGroupPricingManager.jsx)

**Purpose:** View actual pricing + enter rounded pricing for budget planning

**Key Features:**
- Shows actual pricing calculated from `fp_actualcommon` (ASP, MORM, RM)
- User can enter rounded pricing values for planning
- Auto-refresh actual pricing from latest data
- Year-based pricing view
- Division-specific pricing fields

**Pricing Calculation:**
```sql
-- Auto-calculated from fp_actualcommon
ASP (Average Selling Price) = SUM(amount) / SUM(qty_kgs)
MORM (Margin Over Raw Material) = Calculated from cost data
RM (Raw Material Price) = Derived from material costs
```

**Database Tables:**
| Table | Location | Purpose |
|-------|----------|---------|
| `fp_product_group_master` | fp_database | Stores both actual + rounded pricing |
| `fp_actualcommon` | fp_database | Source data for calculating actual pricing |
| `pricing_field_config` | ip_auth_database | Defines pricing fields (ASP, MORM, RM, custom) |

**Pricing Flow:**
1. System calculates actuals from `fp_actualcommon` (last 12 months)
2. Stores in `asp_actual`, `morm_actual`, `rm_actual` columns
3. User enters rounded values in `asp_round`, `morm_round`, `rm_round`
4. Rounded values used in AEBF Budget planning

---

## 🔗 Product Groups → AEBF Integration

### How AEBF Uses Product Groups

The AEBF (Actual/Estimate/Budget/Forecast) pages rely heavily on Product Groups:

**Budget Tab Usage:**
1. **Product Group Dropdown:** Populated from `raw_product_group_mappings` (active PGCombine values)
2. **Material Percentages:** Used to calculate material-specific budget allocations
3. **Pricing Data:** `asp_round`, `morm_round` from `fp_product_group_master` used as default pricing
4. **Product Group Filtering:** Budget data filtered by selected product groups

**Data Flow:**
```
raw_product_group_mappings (defines PGCombine list)
    ↓
fp_product_group_master (material %, pricing)
    ↓
AEBF BudgetTab (budget planning)
    ↓
fp_budget_unified (saved budget data)
```

**Tables Connected to AEBF:**
| Table | Purpose in AEBF |
|-------|----------------|
| `raw_product_group_mappings` | Product group dropdown options |
| `fp_product_group_master` | Default pricing + material breakdown |
| `fp_actualcommon` | Actual sales data comparison |
| `fp_budget_unified` | Stores budget entries |
| `material_column_config` | Material allocation columns |

---

## �🔄 FUTURE UPDATES

_This section will be updated as we discover more about the project_

### Pending Items
- [ ] Document budget upload flow
- [ ] Document estimate upload flow
- [ ] Document forecast upload flow
- [ ] Map all dashboard queries
- [ ] Document all lookup functions

---
## 🚀 PRODUCT GROUPS SYSTEM OPTIMIZATION

### Overview
**Date**: January 10, 2026  
**Performance Gain**: **96% faster pricing queries** (28ms → 1ms)

### Problems Identified

1. **Performance Bottleneck**
   - fp_actualcommon has 54,203 rows
   - Every pricing query scanned all rows with GROUP BY
   - 5 sequential API calls per page load
   - Cross-database queries (no direct SQL JOINs)

2. **Dead Code from Abandoned Migration**
   - `material_config` table (0 rows, never populated)
   - `MaterialConfigService.js` (queried empty table)
   - `/api/config/materials/*` routes (served no data)
   - MaterialPercentageManager made 4 API calls that returned empty

### Solutions Implemented

#### 1. Materialized View (93-96% Faster!)
Created `fp_product_group_pricing_mv` to pre-calculate pricing:
```sql
CREATE MATERIALIZED VIEW fp_product_group_pricing_mv AS
SELECT 
  INITCAP(TRIM(product_group)) as product_group,
  year,
  ROUND(SUM(amount) / NULLIF(SUM(qty_kgs), 0), 2) as asp_actual,
  ROUND(SUM(morm) / NULLIF(SUM(qty_kgs), 0), 2) as morm_actual,
  ROUND(
    (SUM(amount) / NULLIF(SUM(qty_kgs), 0)) - 
    (SUM(morm) / NULLIF(SUM(qty_kgs), 0)),
    2
  ) as rm_actual,
  SUM(qty_kgs) as total_qty_kgs,
  SUM(amount) as total_amount,
  SUM(morm) as total_morm,
  COUNT(*) as transaction_count,
  MAX(invoice_date) as last_sale_date,
  CURRENT_TIMESTAMP as calculated_at
FROM fp_actualcommon
WHERE qty_kgs > 0 AND amount > 0
GROUP BY INITCAP(TRIM(product_group)), year;
```

**Stats**: 108 rows (15 product groups × 8 years)  
**Refresh**: Run nightly via `server/tasks/refreshProductGroupPricing.js`

**⚠️ CRITICAL FIX (Jan 11, 2026)**: Corrected MORM calculation formula
- **Bug**: Used `SUM(morm * qty_kgs)` which incorrectly multiplied already-total MORM values
- **Root Cause**: The `morm` column in `fp_actualcommon` contains **total Margin over RM** for each transaction, NOT per-kg values
- **Fix**: Changed to `SUM(morm)` to correctly aggregate total margins
- **Impact**: Previous calculations showed massive negative RM values (e.g., -8,405.24) because MORM was inflated by ~1000x
- **Correct Calculation**:
  - ASP (Avg Selling Price) = `SUM(amount) / SUM(qty_kgs)` ✅
  - AMGP (Avg Margin/kg) = `SUM(morm) / SUM(qty_kgs)` ✅ (NOT `SUM(morm * qty_kgs)`)
  - RM Price/kg = ASP - AMGP ✅
- **Example**: Commercial Items Plain 2025
  - Total amount: 2,142,819 | Total kgs: 237,269 | Total morm: 1,110,430
  - ASP: 9.03 | MoRM/kg: 4.68 | RM/kg: 4.35 ✅
  - Before fix: ASP: 9.03 | MoRM: 5,684.55❌ | RM: -5,675.52❌

#### 2. Performance Indexes
```sql
-- Pricing queries (partial index excludes zero quantities)
CREATE INDEX idx_actualcommon_pricing 
ON fp_actualcommon(product_group, year, qty_kgs, amount, morm)
WHERE qty_kgs > 0;

-- Product group mappings
CREATE INDEX idx_mappings_division_pgcombine 
ON raw_product_group_mappings(division, pg_combine)
WHERE is_unmapped = false;

-- Material columns
CREATE INDEX idx_material_columns_division 
ON material_column_config(division, display_order)
WHERE is_active = true;
```

#### 3. Initialized Empty Config Table
**pricing_field_config**: Inserted 12 default records (3 fields × 4 divisions)
- `asp_round` (Selling Price)
- `morm_round` (Margin over RM)  
- `rm_round` (RM Price)

#### 4. Removed Dead Code
Deleted:
- ❌ `material_config` table (abandoned migration)
- ❌ `MaterialConfigService.js` (queried empty table)
- ❌ `/api/config/materials/*` API routes (5 endpoints removed)
- ✅ Updated `MaterialPercentageManager.jsx` to use hardcoded material list

### Verification Test Results
```
✅ PASS: Materialized view has 108 rows (15 product groups, 8 years)
✅ PASS: pricing_field_config has 12 records (3 fields × 4 divisions)
✅ PASS: Performance indexes created (3 new indexes)
✅ PASS: material_column_config has 32 records (actively used)
✅ PASS: material_config table removed (dead table)
✅ PASS: Query performance improved by 96% (28ms → 1ms)
✅ PASS: 15 Product Groups related tables (removed 1 dead table)
```

### Maintenance

**Automated Nightly Refresh** ✅  
The materialized view automatically refreshes at 2:00 AM daily via node-cron scheduler.

**Implementation**:
```javascript
// In server/index.js
cron.schedule('0 2 * * *', async () => {
  const result = await refreshProductGroupPricing();
  logger.info(`✅ MV refreshed in ${result.duration}ms`);
});
```

**Logs on startup**:
```
- Product Groups MV Refresh: Scheduled (2:00 AM daily)
```

**Manual refresh** (if needed):
```bash
node server/tasks/refreshProductGroupPricing.js
```

Or PostgreSQL:
```sql
REFRESH MATERIALIZED VIEW fp_product_group_pricing_mv;
```

### Files Created
- ✅ `optimize-product-groups.js` - One-time optimization script (deleted after use)
- ✅ `server/tasks/refreshProductGroupPricing.js` - Nightly refresh task (ACTIVE)
- ✅ `test-product-groups-optimization.js` - Verification tests (deleted after use)
- 📄 Updated: `server/index.js` - Added node-cron scheduler
- 📄 Updated: `server/services/ProductGroupMasterService.js` (now uses materialized view)
- 📄 Updated: `server/routes/config.js` (removed material_config routes)
- 📄 Updated: `src/components/dashboard/MaterialPercentageManager.jsx` (hardcoded materials)

### Before vs After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Pricing Query Time | 28ms | 1ms | **96% faster** |
| Table Scans | 54,203 rows | 108 rows | **99.8% fewer** |
| API Calls (materials) | 4 calls | 0 calls | **Eliminated** |
| Empty Tables | 2 | 0 | **Removed** |
| Dead Code Files | 1 service + 5 routes | 0 | **Cleaned** |

---
## ⚠️ DEVELOPMENT RULES

### 🗑️ Cleanup Policy

**RULE: Clean up temporary files after completing a task**

When working on this project, DO NOT leave behind:
- `check-*.js` - Temporary check/debug scripts
- `test-*.js` - Test scripts
- `debug-*.js` - Debug scripts  
- `find-*.js` - Search/find scripts
- `try-*.js` - Experimental scripts
- `verify-*.js` - Verification scripts
- `trace-*.js` - Trace/log scripts
- `analyze-*.js` - One-time analysis scripts
- `compare-*.js` - Comparison scripts
- `fix-*.js` - One-time fix scripts (unless documented here)
- `apply-*.js` - Migration scripts (unless documented)
- `*-temp.xlsx` - Temporary Excel exports
- `*_DEBUG_*.md` - Debug documentation

**Allowed files in main folder:**
- `PROJECT_RECAP.md` - This living documentation
- `PROJECT_CONTEXT.md` - Project context (DO NOT DELETE)
- `ERP_IMPLEMENTATION_CONTEXT.md` - ERP context (DO NOT DELETE)
- `README.md` - Project readme
- `package.json`, `package-lock.json` - NPM config
- `vite.config.js` - Vite config
- `index.html` - Entry point
- `.env.example`, `.gitignore` - Git config
- `*.code-workspace` - VS Code workspace
- `START-SERVERS.cmd`, `Upload-To-GitHub.cmd` - Essential scripts
- Chart libraries: `chart.umd.min.js`, `chartjs-plugin-datalabels.min.js`, `echarts.min.js`
- `import-excel-to-raw-fast.js` - Core import script (referenced by server)

**Before Commit:**
1. Delete all temp/debug/test files
2. Update PROJECT_RECAP.md if adding permanent changes
3. Run `Get-ChildItem -File *.js` to verify only essential JS files remain

---

## � CRITICAL BUG FIXES - AEBF BUDGET MODULE (Jan 10-11, 2026)


### Bug 5: Divisional Budget Subsequent Saves Silently Fail (Jan 11, 2026)

**Issue:** A unique index on fp_budget_unified prevented inserting new records after initial approval. Save endpoint used DELETE+INSERT for drafts only, but once approved, subsequent inserts failed silently due to unique constraint.

**Fix:** Changed to UPSERT (ON CONFLICT DO UPDATE) to properly handle updates to existing records. Also fixed case-sensitivity in submit query.

**Files:** server/routes/budget-draft.js

---

### Bug 6: Budget Year Default Wrong (Jan 11, 2026)

**Issue:** Budget year defaulted to same year as actual instead of actual+1.

**Fix:** Changed default to always use actual+1 (e.g., actual 2026 -> budget 2027). Year is added to dropdown if not present.

**Files:** src/components/MasterData/AEBF/BudgetTab.jsx

---

### Context
The AEBF Budget module (Divisional Budget page) had multiple critical bugs discovered and fixed during testing. This section documents all issues and solutions.

---

### Bug 1: 500 Errors on Page Load (Jan 10, 2026)

**Symptoms:**
- AEBF Divisional Budget page completely broken with 500 errors
- Two endpoints failing simultaneously:
  - `POST /api/budget-draft/save-divisional-draft` 
  - `POST /api/aebf/sales-rep-divisional-ultra-fast`

#### Bug 1A: Undefined Table Name Error

**Error Message:**
```
relation "undefined" does not exist
```

**Root Cause:**  
`getTableNames()` function in `server/routes/aebf/shared.js` was missing the `budgetUnified` property, causing table name to be undefined.

**Fix Applied:**
```javascript
// server/routes/aebf/shared.js
function getTableNames(division) {
  const code = division.toLowerCase();
  return {
    actualCommon: `${code}_actualcommon`,
    budgetUnified: `${code}_budget_unified`,  // ✅ ADDED
    productGroupExclusions: `${code}_product_group_exclusions`,
    salesRepGroupMembers: `${code}_sales_rep_group_members`,
    // ... other tables
  };
}
```

**Files Modified:**
- `server/routes/aebf/shared.js` (Lines 15-30)

---

#### Bug 1B: Column Name Mismatch Error

**Error Message:**
```
column d.type does not exist
```

**Root Cause:**  
Queries in `UniversalSalesByCountryService.js` used `d.type` but the view column is actually `d.data_type`.

**Fix Applied:**  
Mass replaced ALL instances of `d.type` with `d.data_type` throughout the file (multiple query locations).

**Files Modified:**
- `server/database/UniversalSalesByCountryService.js` (Multiple lines)

**Status:** ✅ Both 500 errors resolved, page loads successfully

---

### Enhancement 1: UI Improvements (Jan 10, 2026)

#### Enhancement 1A: Budget Number Formatting

**Issue:**  
Budget figures showing excessive decimal places (67.123456k instead of 67.1k), inconsistent with actual data display format.

**Solution:**  
Added rounding to 1 decimal place throughout the system:

```javascript
// Applied to MT, Amount, and MoRM displays
const formattedValue = Math.round(value * 10) / 10;
```

**Benefit:** Consistent number formatting across actual and budget displays.

---

#### Enhancement 1B: Budget Year Dropdown Enhancements

**Previous Behavior:**  
Budget year was calculated (actualYear + 1), not selectable by user.

**New Features:**

1. **Future Year Generation:**
```javascript
// Backend: server/routes/aebf/html-budget.js
const currentYear = new Date().getFullYear();
const futureYears = [];
for (let i = 0; i <= 3; i++) {
  futureYears.push(currentYear + i);
}
const allYears = [...new Set([...existingYears, ...futureYears])].sort((a, b) => b - a);
```

Shows current year + 3 future years (2026-2029).

2. **Manual Year Entry:**
```javascript
// Frontend: src/components/MasterData/AEBF/BudgetTab.jsx
<Select
  value={divisionalHtmlBudgetYear}
  onChange={(value) => {
    const year = parseInt(value);
    if (!isNaN(year) && year >= 2020 && year <= 2099) {
      setDivisionalHtmlBudgetYear(year);
    }
  }}
  onSearch={(value) => {
    const year = parseInt(value);
    if (!isNaN(year) && year >= 2020 && year <= 2099) {
      setDivisionalHtmlBudgetYear(year);
    }
  }}
  showSearch
  allowClear
/>
```

Validates: 2020-2099 range.

**Benefit:** Users can create budgets for any future year, not just actualYear + 1.

---

#### Enhancement 1C: Product Group Sorting

**Issue:**  
Product groups displayed in random order, hard to find specific items.

**Solution:**  
Implemented smart sorting with special rules:

```javascript
// Frontend: src/components/MasterData/AEBF/BudgetTab.jsx
const sortedTableData = tableData.sort((a, b) => {
  const aName = (a.productGroup || '').toUpperCase();
  const bName = (b.productGroup || '').toUpperCase();
  
  // "Services Charges" always last
  if (aName === 'SERVICES CHARGES') return 1;
  if (bName === 'SERVICES CHARGES') return -1;
  
  // "Other" or "Others" second to last (just before Services Charges)
  const isAOther = aName === 'OTHER' || aName === 'OTHERS';
  const isBOther = bName === 'OTHER' || bName === 'OTHERS';
  if (isAOther && !isBOther) return 1;
  if (isBOther && !isAOther) return -1;
  
  // Alphabetical for all others
  return aName.localeCompare(bName);
});
```

**Sorting Rules:**
1. Alphabetical (A-Z)
2. "Other"/"Others" → second to last
3. "Services Charges" → always last

**Benefit:** Improved readability and user experience.

---

#### Enhancement 1D: JSX Rendering Bug Fix

**Issue:**  
Extra closing brackets `), }, ]} />` rendering as text on the page.

**Root Cause:**  
Malformed JSX syntax with extra brackets outside component structure.

**Fix:**  
Removed stray closing brackets from JSX code.

**Status:** ✅ Fixed - Clean UI rendering

---

### Enhancement 2: Pricing Year Logic for Budget Calculations (Jan 10, 2026)

**Issue:**  
Total Budget Amount and Total Budget MoRM rows showing zeros. Pricing data not being used correctly.

**Root Cause Investigation:**
- Backend was querying pricing for `actualYear` instead of appropriate year for budget
- 2026 budget should use 2025 pricing (most recent rounded actuals)

**Pricing Flow Understanding:**
- Product Group Pricing page contains "ROUND" column with averaged actual prices
- 2025 pricing = rounded average of 2024 actuals  
- 2026 budget should use 2025 pricing (forward-looking approach)

**Solution Implemented:**

```javascript
// server/routes/aebf/divisional.js
// Pricing logic:
// - For 2025 and earlier: Use pricing from actualYear (preserves existing data)
// - For 2026 onwards: Use pricing from previous year (budgetYear - 1)
//   Example: 2026 budget uses 2025 pricing (rounded from 2024 actuals)

let pricingYear;
if (budgetYear <= 2025) {
  // Legacy behavior: use actual year pricing for existing 2025 budgets
  pricingYear = parseInt(actualYear);
} else {
  // New behavior: use previous year's pricing for 2026+ budgets
  pricingYear = budgetYear - 1;
}

logger.info(`Using pricing year ${pricingYear} for budget year ${budgetYear}`);

// Query pricing table with fallback
const pricingQuery = `
  SELECT DISTINCT ON (product_group)
    product_group, asp_round, morm_round
  FROM ${pricingTable}
  WHERE division = $1 AND year <= $2
  ORDER BY product_group, year DESC
`;
const pricingResult = await divisionPool.query(pricingQuery, [division, pricingYear]);
```

**Fallback Mechanism:**  
If target year pricing doesn't exist, automatically uses most recent year available with logging.

**Response Enhancement:**
```javascript
successResponse(res, {
  data: tableData,
  pricingData,
  pricingYear,  // ✅ Inform frontend which year's pricing is used
  budgetData,
  ...
});
```

**Frontend Debugging:**
```javascript
console.log('📊 Loaded divisional pricing data:', {
  productGroups: Object.keys(pricingData).length,
  pricingYear: responseData.pricingYear || 'unknown',
  samplePricing: Object.keys(pricingData).slice(0, 3).map(pg => ({
    productGroup: pg,
    asp: pricingData[pg].asp,
    morm: pricingData[pg].morm
  }))
});
```

**Calculation Flow:**
1. User enters budget in **MT** (e.g., 10 MT)
2. Frontend retrieves pricing: ASP = 9.00 AED/kg, MoRM = 4.70 AED/kg (from pricing year)
3. Converts MT to KG: 10 MT × 1000 = 10,000 kg
4. Calculates Amount: 10,000 kg × 9.00 = 90,000 AED (displays as **90.0k**)
5. Calculates MoRM: 10,000 kg × 4.70 = 47,000 AED (displays as **47.0k**)

**Files Modified:**
- `server/routes/aebf/divisional.js` (Lines 230-268)
- `src/components/MasterData/AEBF/BudgetTab.jsx` (Lines 2912-2926)

**Status:** ✅ Fixed - Budget Amount and MoRM totals now calculate correctly with appropriate pricing

---

### Bug 2: Budget Amount/MoRM Showing Calculated Values Instead of Stored (Jan 10, 2026)

**Symptoms:**
- UI showing calculated values: **101.95M** Amount, **38.76M** MoRM
- Database had stored values: **109.11M** Amount, **42.29M** MoRM  
- **User Critical Quote:** *"if the prices already in the database, system should take them, should not calculate!!!!!!!!"*

**Root Cause:**  
Frontend was ALWAYS calculating Amount/MoRM from `MT × pricing`, completely ignoring values stored in database.

**Expected Behavior:**
- **Existing budgets:** Use stored Amount/MoRM from database
- **New budgets:** Calculate from MT × pricing (no stored values yet)

#### Solution Implemented

**Backend Enhancement** (`server/routes/aebf/divisional.js`):

1. Modified budget query to include Amount and MoRM:
```javascript
const budgetQuery = `
  SELECT 
    b.pgcombine as product_group,
    b.month_no,
    SUM(b.qty_kgs) as total_kgs,
    SUM(b.amount) as total_amount,    // ✅ ADDED
    SUM(b.morm) as total_morm          // ✅ ADDED
  FROM ${tables.budgetUnified} b
  ...
`;
```

2. Created detailed budget data structure:
```javascript
let budgetDataDetailed = {};  // ✅ NEW: Store Amount/MoRM separately

budgetResult.rows.forEach(row => {
  const key = `${row.product_group}|${row.month_no}`;
  budgetData[key] = Math.round((parseFloat(row.total_kgs) || 0) / 1000 * 10) / 10;
  
  // ✅ Store Amount and MoRM values
  budgetDataDetailed[key] = {
    mt: Math.round((parseFloat(row.total_kgs) || 0) / 1000 * 10) / 10,
    amount: parseFloat(row.total_amount) || 0,
    morm: parseFloat(row.total_morm) || 0
  };
});
```

3. Included in API response:
```javascript
successResponse(res, {
  data: tableData,
  pricingData,
  budgetData,
  budgetDataDetailed,  // ✅ NEW: Stored Amount/MoRM values
  servicesChargesBudget,
  budgetStatus,
  actualYear,
  budgetYear
});
```

**Frontend Enhancement** (`src/components/MasterData/AEBF/BudgetTab.jsx`):

1. Added state for detailed budget data:
```javascript
const [divisionalBudgetDetailed, setDivisionalBudgetDetailed] = useState({});
```

2. Store data from API response:
```javascript
const budgetDetailedSource = responseData.budgetDataDetailed || {};
setDivisionalBudgetDetailed(budgetDetailedSource);

console.log('📊 Loaded budget detailed data:', {
  keys: Object.keys(budgetDetailedSource).length,
  sample: Object.keys(budgetDetailedSource).slice(0, 2).map(k => ({
    key: k,
    data: budgetDetailedSource[k]
  }))
});
```

3. Modified calculations to check stored values FIRST:
```javascript
const divisionalMonthlyAmountTotals = useMemo(() => {
  const totals = {};
  for (let month = 1; month <= 12; month++) {
    totals[month] = 0;
  }
  
  divisionalHtmlTableData.forEach(row => {
    for (let month = 1; month <= 12; month++) {
      const key = `${row.productGroup}|${month}`;
      
      // ✅ Check if we have stored Amount from database
      const storedData = divisionalBudgetDetailed[key];
      if (storedData && storedData.amount) {
        // Use stored Amount value (already in full AED)
        totals[month] += storedData.amount;
      } else {
        // Calculate from MT × pricing (for new budgets)
        const pricing = findPricing(row.productGroup);
        const mtValue = parseFloat((divisionalHtmlBudgetData[key] || '').toString().replace(/,/g, '')) || 0;
        totals[month] += mtValue * 1000 * pricing.sellingPrice;
      }
    }
  });
  return totals;
}, [divisionalHtmlTableData, divisionalHtmlBudgetData, divisionalBudgetDetailed, findPricing]);
```

Similar logic applied to `divisionalMonthlyMormTotals`.

**Files Modified:**
- `server/routes/aebf/divisional.js` (Lines 290-360, 420)
- `src/components/MasterData/AEBF/BudgetTab.jsx` (Lines 92, 2930-2945, 3765-3840)

**Status:** ✅ Fixed - Stored database values now respected, calculations only for new budgets

---

### Bug 3: Variable Scope Error (Jan 10, 2026)

**Symptoms:**
- 500 error immediately after implementing stored Amount/MoRM feature
- Error: `budgetDataDetailed is not defined`

**Root Cause:**  
Variable declared inside try block but referenced outside its scope.

**Fix Applied:**
```javascript
// BEFORE (BUG):
try {
  let budgetDataDetailed = {};  // ❌ Inside try block
  // ... logic
} catch (error) {
  // ...
}
successResponse(res, { budgetDataDetailed });  // ❌ Not accessible here

// AFTER (FIXED):
let budgetData = {};
let budgetDataDetailed = {};  // ✅ Declared before try block
let servicesChargesBudget = {};

try {
  // ... logic
} catch (error) {
  // ...
}
successResponse(res, { budgetDataDetailed });  // ✅ Accessible
```

**Files Modified:**
- `server/routes/aebf/divisional.js` (Lines 289-295)

**Status:** ✅ Fixed - Variable properly scoped

---

### Bug 4: Budget Year Switching Not Working (Jan 11, 2026)

**Symptoms:**
- Selecting Budget 2026 showed 2025 budget data
- Selecting Actual 2024 / Budget 2025 showed zero (but should show 2025 data)
- Budget year dropdown appeared broken - always displaying 2025 data

**Root Cause: Missing React useCallback Dependency**

The `fetchDivisionalHtmlTableData` callback used `divisionalHtmlBudgetYear` in its body but did NOT include it in the dependency array:

```javascript
// BEFORE (BUG):
const fetchDivisionalHtmlTableData = useCallback(async () => {
  const budgetYear = divisionalHtmlBudgetYear ?? ...;  // ✅ Uses the variable
  // ... fetch logic
}, [selectedDivision, divisionalHtmlFilters.actualYear]);  
// ❌ Missing divisionalHtmlBudgetYear dependency!

// When budget year changed:
// 1. React did NOT recreate the callback
// 2. Callback still had OLD (stale) budget year value
// 3. API fetched wrong year's data
```

**This is a classic "stale closure" bug in React.**

#### Solution Applied

**Fix 1: Added Missing Dependency**
```javascript
const fetchDivisionalHtmlTableData = useCallback(async () => {
  const budgetYear = divisionalHtmlBudgetYear ?? ...;
  // ... fetch logic
}, [selectedDivision, divisionalHtmlFilters.actualYear, divisionalHtmlBudgetYear]);
// ✅ Added divisionalHtmlBudgetYear to dependencies
```

**Fix 2: Clear Old Data Before Loading New**
```javascript
const fetchDivisionalHtmlTableData = useCallback(async () => {
  // ... validation
  
  const budgetYear = divisionalHtmlBudgetYear ?? (parseInt(divisionalHtmlFilters.actualYear) + 1);
  
  console.log('🔄 Fetching divisional data:', {
    division: selectedDivision,
    actualYear: divisionalHtmlFilters.actualYear,
    budgetYear: budgetYear
  });
  
  // ✅ Clear old data before loading new (prevents stale data display)
  setDivisionalHtmlBudgetData({});
  setDivisionalBudgetDetailed({});
  
  setDivisionalHtmlTableLoading(true);
  // ... API call
}, [selectedDivision, divisionalHtmlFilters.actualYear, divisionalHtmlBudgetYear]);
```

**Fix 3: Backend Logging for Debugging**
```javascript
// server/routes/aebf/divisional.js
router.post('/divisional-html-budget-data', ..., async (req, res) => {
  const { division, actualYear, budgetYear: requestedBudgetYear } = req.body;
  
  logger.info('📊 Divisional budget data request:', {
    division,
    actualYear,
    requestedBudgetYear,
    rawBody: req.body
  });
  
  let budgetYear = requestedBudgetYear ? parseInt(requestedBudgetYear) : parseInt(actualYear);
  
  logger.info(`📅 Budget year determined: ${budgetYear} (requested: ${requestedBudgetYear})`);
  // ...
});
```

**Files Modified:**
- `src/components/MasterData/AEBF/BudgetTab.jsx` (Lines 2860-3000)
- `server/routes/aebf/divisional.js` (Lines 46-70)

**Expected Behavior After Fix:**
- **Actual 2025, Budget 2025:** Shows 9,705 MT, 109.11M Amount (from database)
- **Actual 2025, Budget 2026:** Shows empty/zero (no 2026 data exists)
- **Actual 2024, Budget 2025:** Shows 9,705 MT (2025 budget correctly loaded)

**Status:** ✅ Fixed - Budget year switching now works correctly

---

### Summary of All Fixes and Enhancements

| Issue | Type | Impact | Status | Files Changed |
|-------|------|--------|--------|---------------|
| Undefined table name | Bug | Page crash | ✅ Fixed | shared.js |
| Column mismatch | Bug | API 500 error | ✅ Fixed | UniversalSalesByCountryService.js |
| Budget number formatting | Enhancement | Consistency | ✅ Added | BudgetTab.jsx |
| Budget year dropdown | Enhancement | UX improvement | ✅ Added | html-budget.js, BudgetTab.jsx |
| Product group sorting | Enhancement | Readability | ✅ Added | BudgetTab.jsx |
| JSX rendering bug | Bug | UI display | ✅ Fixed | BudgetTab.jsx |
| Pricing year logic | Enhancement | Correct calculations | ✅ Added | divisional.js |
| Calculated vs stored values | Bug | Wrong totals | ✅ Fixed | divisional.js, BudgetTab.jsx |
| Variable scope error | Bug | API crash | ✅ Fixed | divisional.js |
| Budget year switching | Bug | Wrong data displayed | ✅ Fixed | BudgetTab.jsx, divisional.js |

**Total Impact:**  
- **6 critical bugs** fixed
- **4 major enhancements** added
- **8 files** modified  
- Page went from **completely broken** to **fully functional with enhanced UX**

---

### Lessons Learned

1. **React Dependencies:** ALWAYS include ALL variables used in useCallback/useMemo dependencies
   - Use ESLint's `exhaustive-deps` rule to catch these
   - Stale closures cause hard-to-debug issues

2. **Variable Scope:** Declare variables before try blocks if needed outside catch
   
3. **Data Clearing:** Clear old state before loading new data to prevent stale displays

4. **Database vs Calculated:** When data exists in DB, use it - don't recalculate

5. **Logging:** Add debug logs for complex flows (budget year selection, API requests)

6. **Pricing Logic:** Use forward-looking pricing (budgetYear - 1) for future budgets

7. **UI/UX:** Small enhancements (formatting, sorting) significantly improve user experience

---

## 📝 CHANGE LOG

| Date | Change | Details |
|------|--------|---------|
| 2026-01-10 | Initial document | Created PROJECT_RECAP.md |
| 2026-01-10 | Proper Case Fix | Applied INITCAP to all text fields in sync function |
| 2026-01-10 | Fast Import | Created import-excel-to-raw-fast.js to fix slow sync |
| 2026-01-10 | Cleanup | Deleted 400+ temp/debug files, added cleanup rules |
| 2026-01-10 | Product Groups Documentation | Added comprehensive Product Groups system documentation (3 sub-pages, tables, AEBF integration) |
| 2026-01-10 | Product Groups Optimization | **96% performance improvement** - Created materialized view, added indexes, removed dead code (material_config), initialized pricing_field_config |
| 2026-01-10 | AEBF Budget Bug #1 | Fixed undefined table name and column mismatch (500 errors) |
| 2026-01-10 | AEBF Budget Enhancement #1 | Added number formatting, budget year dropdown enhancements, product group sorting |
| 2026-01-10 | AEBF Budget Enhancement #2 | Implemented pricing year logic (budgetYear - 1 for 2026+) |
| 2026-01-10 | AEBF Budget Bug #2 | Fixed stored Amount/MoRM not being used (showed wrong totals) |
| 2026-01-10 | AEBF Budget Bug #3 | Fixed variable scope error in divisional.js |
| 2026-01-10 | AEBF Budget Bug #4 | Fixed JSX rendering bug (extra brackets) |
| 2026-01-11 | AEBF Budget Bug #5 | **Critical:** Fixed budget year switching bug (stale closure in React useCallback) |
| 2026-01-11 | Data Flow Documentation | **NEW:** Created comprehensive Mermaid diagrams in DATA_FLOWS_MERMAID.md showing actual system architecture (10 diagrams covering all flows) |
| 2026-01-11 | ProjectWorkflow UI Update | **MAJOR:** Replaced outdated data flow diagrams with live Mermaid charts in ProjectWorkflow page showing actual current system (fp_budget_unified, draft/approved, etc.) |
| 2026-01-11 | Product Group Pricing Bug Fix | **CRITICAL:** Fixed materialized view MORM calculation - changed `SUM(morm * qty_kgs)` to `SUM(morm)` because morm column contains total margin per transaction, not per-kg. This was causing massive negative RM values (-8,405 instead of +4.35). Also fixed ambiguous column reference in ProductGroupMasterService.js UPDATE query. |
| 2026-01-13 | **Forecast P&L Tab** | **NEW FEATURE:** Complete Forecast P&L simulation page with editable columns, % of Sales calculations, and save to database functionality. |
| 2026-01-13 | Services Charges Editing | **NEW FEATURE:** Services Charges in Forecast Sales are now editable with MoRM = Sales logic. |

---

## 🔮 FORECAST P&L FEATURE (January 13, 2026)

### Overview

Created a comprehensive **Forecast P&L Tab** in the AEBF module that simulates P&L figures based on forecast sales data.

### Components Created/Modified

**Frontend:**
- `src/components/MasterData/AEBF/ForecastPLTab.jsx` - Main Forecast P&L component
- `src/components/MasterData/AEBF/ForecastSalesTab.jsx` - Added Services Charges editing

**Backend:**
- `server/routes/aebf/forecast-pl.js` - API routes for Forecast P&L
- `server/routes/aebf/projections.js` - Updated for Services Charges direct sales/morm
- `server/routes/aebf/shared.js` - Added `plData` table mapping
- `server/routes/aebf/index.js` - Registered forecast-pl routes

### Features Implemented

#### 1. 9-Column Layout
| Column | Description |
|--------|-------------|
| P&L Ledgers | Row labels (Sales, Material, Labour, etc.) |
| FY Actual Value | Actual year values |
| FY Actual %Sls | Actual % of Sales |
| FY Budget Value | Budget year values |
| FY Budget %Sls | Budget % of Sales |
| FY Forecast1 Value | Forecast Year 1 (editable) |
| FY Forecast1 %Sls | Forecast Year 1 % (editable) |
| FY Forecast2 Value | Forecast Year 2 (editable) |
| FY Forecast2 %Sls | Forecast Year 2 % (editable) |

#### 2. Year Pattern (Same as Forecast Sales)
```
Base Year (Actual) → Budget (Base+1) → Forecast1 (Base+2) → Forecast2 (Base+3)
Example: 2024 → 2025 → 2026 → 2027
```

#### 3. Editable Forecast Columns
- **Value editing**: Edit the amount directly, % recalculates automatically
- **% editing**: Edit the % of Sales, value recalculates automatically (vice-versa)
- Non-editable items: Sales, Material, Volume, MoRM (from Forecast Sales projections)
- Editable items: Labour, Depreciation, Electricity, Selling Expenses, Transportation, etc.

#### 4. Calculated Fields
All derived P&L lines auto-calculate:
- `actual_direct_cost` = Labour + Depreciation + Electricity + Others Mfg Overheads
- `cost_of_sales` = Material + Dir.Cost of Goods Sold
- `direct_cost_pct_of_cogs` = (Dir.Cost of Goods Sold / Cost of Sales) × 100 (shown as xx.xx%)
- `gross_profit` = Sales - Cost of Sales
- `net_profit` = Gross Profit - Total Below GP Expenses
- `ebitda` = Net Profit + Depreciation + Bank Interest + R&D + Other Provision

#### 5. Save to Database
- Saves Forecast P&L to `fp_pl_data` table with `data_type = 'Forecast'`
- Monthly distribution based on Budget's monthly pattern (proportional allocation)

#### 6. Services Charges in Forecast Sales
- Services Charges row now editable in Forecast Sales page
- When editing Sales, MoRM auto-sets to same value (MoRM = Sales for services)
- Backend `projections.js` updated to handle direct sales/morm values

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    FORECAST SALES PAGE                          │
│               (fp_product_group_projections)                    │
│                                                                 │
│  Product Groups with: Sales, Volume (KGs), MoRM                 │
│  Type: FORECAST | Year: 2027, 2028                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Sales, Material, MoRM, Volume
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FORECAST P&L PAGE                            │
│                                                                 │
│  From Projections:                                              │
│    • Sales (from forecast sales)                                │
│    • Material = Sales - MoRM                                    │
│    • Sales Volume (KGs)                                         │
│    • MoRM                                                       │
│                                                                 │
│  From Budget % of Sales:                                        │
│    • Labour, Depreciation, Electricity                          │
│    • Selling Expenses, Transportation                           │
│    • Admin & Mgmt Fee, Bank Interest, etc.                      │
│                                                                 │
│  User Can Edit: % of Sales OR Value (vice-versa)                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Save Forecast P&L
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    fp_pl_data TABLE                             │
│                                                                 │
│  year: 2027, 2028                                               │
│  data_type: 'Forecast'                                          │
│  month: January - December                                      │
│  sales, material, labour, depreciation, etc.                    │
│  selling_expenses_override, admin_mgmt_fee_override             │
└─────────────────────────────────────────────────────────────────┘
```

### Bug Fixes During Implementation

| Bug | Root Cause | Fix |
|-----|------------|-----|
| 500 error on save | `plData` missing from `getTableNames()` | Added `plData: ${code}_pl_data` to shared.js |
| INSERT column mismatch | Wrong column names in INSERT | Simplified INSERT to match actual table schema |
| Direct Cost % showing null | Derived fields not calculated for Actual/Budget | Added `calculateYearTotals()` function with all derived fields |
| % showing integers | `Math.round(num) + '%'` | Changed to `num.toFixed(2) + '%'` for xx.xx% format |
| Services Charges not editable | Hardcoded as non-editable | Added `servicesChargesInputs` state and handlers |

### Verification Results

```
=== PROJECTIONS (Forecast Sales source) ===
Year: 2027 | Sales: 125,065,000 | MoRM: 45,085,000 | KGs: 11,245,000
Year: 2028 | Sales: 140,069,000 | MoRM: 50,118,000 | KGs: 12,325,000

=== SAVED P&L FORECAST ===
Year: 2027 | Sales: 125,065,000 | Material: 79,980,000 ✅
Year: 2028 | Sales: 140,069,000 | Material: 89,951,000 ✅

Material Calculation Verified:
2027: 125,065,000 - 45,085,000 = 79,980,000 ✅
2028: 140,069,000 - 50,118,000 = 89,951,000 ✅
```

### Files Summary

| File | Changes |
|------|---------|
| `ForecastPLTab.jsx` | New component - 834 lines |
| `ForecastSalesTab.jsx` | Added Services Charges editing |
| `forecast-pl.js` | New backend routes - 645 lines |
| `projections.js` | Updated for Services Charges |
| `shared.js` | Added `plData` table mapping |
| `index.js` (routes) | Registered forecast-pl routes |

---

## 📤 FORECAST P&L EXCEL EXPORT (Added Jan 13, 2026)

### Overview

Export functionality for Forecast P&L page - generates 2-sheet Excel workbook matching existing system formats.

### Features

- **Sheet 1: Sales by Product Group** - Matches divisional budget sales format
- **Sheet 2: P&L** - Matches Budget P&L format with Amount | % of Sls | Per Kg columns
- **5 Years**: Previous Actual, Base Actual, Budget, Forecast 1, Forecast 2
- **Unified color scheme by period** (5 distinct colors)
- **Borders on all cells**
- **Bold formatting** for key ledgers

### Data Source Logic

| Data Type | Sales, MORM, Material | Calculated Items | Dir.Cost Stock Adj | Other Items |
|-----------|----------------------|------------------|-------------------|-------------|
| **Actual (prevYear, baseYear)** | Database values | Database values | Database values | Database values |
| **Budget** | Database values | Database values | Database values | Database values |
| **Forecast (Fcst1, Fcst2)** | Formulas → PG sheet | Formulas (calculated) | 0 | Database values |

### Color Scheme (5 years = 5 colors)

| Year | Color |
|------|-------|
| 2024 Actual | Light lavender (`FFD6EAF8`) |
| 2025 Actual | Light blue (`FFE3F2FD`) |
| 2026 Budget | Light green (`FFDCEDC8`) |
| 2027 Fcst | Light yellow (`FFFFF3E0`) |
| 2028 Fcst | Light coral (`FFFCD5B4`) |

### Bold Items (P&L Sheet)

```javascript
['sales', 'cost_of_sales', 'morm', 'dir_cost_goods_sold', 'gross_profit', 
 'total_below_gp_expenses', 'total_expenses', 'net_profit', 'ebit', 'ebitda']
```

### Key Implementation Details

1. **Title Format**: `{Division} Actual & Forecast P&L - {prevYear}-{fcstYear2} (AED)`
2. **Year headers**: Period-specific colors (not all blue)
3. **P&L links to Sales sheet** via Excel formulas for Forecast years only
4. **Grand Total section** in Sales sheet with formulas
5. **Dir.Cost in Stock/Stock Adj.**: Shows actual data for Actual/Budget years, 0 for Forecast

### Issues Fixed During Development

| Issue | Cause | Fix |
|-------|-------|-----|
| Wrong format | Custom layout instead of existing format | Rewrote to match divisional.js and budget-pl.js formats |
| Sales/MORM wrong for Actual | Using PG sheet formulas | Changed to use database values for Actual years |
| Budget year wrong | Using PG sheet formulas | Changed to use database values for Budget (only Forecast uses formulas) |
| Material wrong for Actual | Using `cost_of_sales` key | Changed to use `material` key |
| Calculated items wrong for Actual | Always using Excel formulas | Added isActualYear/isForecastYear check |
| Dir.Cost Stock Adj always 0 | Hardcoded to 0 | Check isForecastYear - Actual/Budget use db, Forecast uses 0 |
| Title hardcoded years | Missing prevYear | Added dynamic `${prevYear}-${fcstYear2}` |
| Missing borders | No border styling | Added `cellBorder` to all cells |
| Year headers all blue | Single header color | Period-specific colors matching data rows |

### File Changes

| File | Location | Lines Changed |
|------|----------|--------------|
| `server/routes/aebf/forecast-pl.js` | Export endpoint | Lines 644-1493 (~850 lines) |

### Endpoint

```
GET /api/aebf/:division/forecast-pl/export-excel?year=2025
```

Returns: `FORECAST_PL_{DIV}_{prevYear}-{fcstYear2}_{date}_{time}.xlsx`

---

## 🔄 Budget Draft Table Migration (fp_budget_unified_draft)

### Migration: sales_rep_budget_draft → budget_unified_draft
**Date:** January 16, 2026  
**Goal:** Rename draft table and align its structure with `fp_budget_unified`

**Problem:**
The old draft table `fp_sales_rep_budget_draft` had different column names than `fp_budget_unified`:
- Different column names (e.g., `customername` vs `customer_name`)
- Different structure (3 rows per record with `values_type` vs single row with `qty_kgs`, `amount`, `morm`)
- Inconsistent naming convention

**Solution:**
Created new table `fp_budget_unified_draft` with columns matching `fp_budget_unified`:

**Old Table (fp_sales_rep_budget_draft):**
```sql
division, budget_year, month, salesrepname, customername, countryname, 
productgroup, values, type, status, created_at, updated_at, last_auto_save
```

**New Table (fp_budget_unified_draft):**
```sql
division_name, division_code, budget_year, month_no, sales_rep_name, 
customer_name, country, pgcombine, qty_kgs, amount, morm, material, process,
budget_status, budget_type, is_budget, created_at, updated_at, last_auto_save
```

### Migration Script
**File:** `migrations/create-budget-unified-draft.js`

- Creates `fp_budget_unified_draft` table with 32 columns matching `fp_budget_unified`
- Creates indexes for common queries
- Migrates existing data from old table (pivots 3-row format to single-row)
- Adds unique constraint for upsert support

### Column Mapping (Old → New)
| Old Column | New Column |
|------------|------------|
| `division` | `division_name` |
| `month` | `month_no` |
| `salesrepname` | `sales_rep_name` |
| `customername` | `customer_name` |
| `countryname` | `country` |
| `productgroup` | `pgcombine` |
| `values` | `qty_kgs` |
| `type` | (removed - now single row) |

### Files Updated

| File | Changes |
|------|---------|
| `server/routes/budget-draft.js` | Updated `getTableNames()` to return `budgetUnifiedDraft`; Updated all endpoints (`save-draft`, `load-draft`, `submit-final`, `delete-draft`, `delete-all-budget`, `delete-final`) to use new table and column names |
| `server/routes/aebf/shared.js` | Changed `salesRepBudgetDraft` → `budgetUnifiedDraft` |
| `server/routes/aebf/helpers.js` | Changed `salesRepBudgetDraft` → `budgetUnifiedDraft` |
| `server/utils/divisionDatabaseHelper.js` | Updated table lists for division sync |
| `server/services/CustomerMergingAI.js` | Updated `getAllCustomers()` to use new column names |
| `server/services/DataFilteringHelper.js` | Changed `salesRepBudgetDraft` → `budgetUnifiedDraft` |
| `server/database/UniversalSalesByCountryService.js` | Updated `getAllCustomers()` to use new tables and columns |

### Bug Fixed During Migration
**Issue:** Duplicate `divisionCode` variable declaration in `submit-final` endpoint  
**Error:** `SyntaxError: Identifier 'divisionCode' has already been declared`  
**Fix:** Removed redundant `const divisionCode = extractDivisionCode(division);` at line 453 (already declared at line 359)

### Verification
```
✅ Table exists: true
✅ Unique indexes: idx_budget_unified_draft_unique
✅ Records migrated: 192 rows (from 96 pivoted rows)
✅ Common columns with budget_unified: 32
✅ Draft-only columns: last_auto_save
```

### Migration Command
```bash
node migrations/create-budget-unified-draft.js
```

### Notes
- Old table `fp_sales_rep_budget_draft` still exists for rollback safety
- Can be dropped after further verification
- Auto-save functionality preserved with `last_auto_save` column

---
