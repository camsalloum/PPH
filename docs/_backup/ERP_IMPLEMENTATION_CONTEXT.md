# ERP IMPLEMENTATION CONTEXT

**Status**: 🚧 IN PROGRESS - Building incrementally  
**Last Updated**: January 6, 2026  
**Owner**: IPDashboard Development Team

---

## 1. ARCHITECTURE OVERVIEW

### Three-Layer Data Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  ORACLE ERP SYSTEM (Source)                       │
│              HAP111.XL_FPSALESVSCOST_FULL (57 columns)            │
│              Server: PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB     │
│              User: noor | Package: oracledb (npm)                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1: Raw Data (Untouched Oracle Copy)                         │
│ ✅ fp_raw_oracle (60 columns: 57 Oracle + 3 metadata)            │
│ • Sync script: scripts/simple-oracle-sync.js                     │
│ • API trigger: POST /api/oracle-direct/sync                      │
│ • Modes: by year or all years                                    │
│ • Method: oracledb direct fetch + PostgreSQL COPY (bulk)         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2: Transformed Data (Business Logic Applied)                │
│ ✅ fp_actualcommon (70+ columns)                                  │
│ • Transform: sync_oracle_to_actualcommon() PL/pgSQL function     │
│ • Applies: INITCAP case normalization, division mapping,         │
│   sales rep group lookup, product group (pgcombine) mapping,     │
│   customer merge rules                                           │
│ • Called automatically at end of each sync                       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3: Unified Views & Dashboards                               │
│ • Dashboard queries against fp_actualcommon                      │
│ • Budget comparison (fp_actualcommon vs fp_budget_unified)        │
│ • KPI displays (actual sales, variance analysis)                 │
└──────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `scripts/simple-oracle-sync.js` | Primary sync script (Oracle → fp_raw_oracle) |
| `scripts/create-oracle-raw-table.js` | Creates fp_raw_oracle table (57 cols + metadata) |
| `scripts/create-oracle-sync-trigger.js` | Creates sync_oracle_to_actualcommon() function |
| `server/routes/oracleDirectSync.js` | API endpoints for UI-triggered sync |
| `server/services/OracleERPSyncService.js` | Legacy ODBC-based service (not actively used) |

### Data Flow - By Setting Category

As we clarify each settings page, detailed flows will be added below:

- [Section 2.1: Company Info](#21-company-info-saas-platform-source)
- [Section 2.2: Product Groups](#22-product-groups) 
- [Section 2.3: Sales Reps & Groups](#23-sales-reps--groups)
- [Section 2.4: Countries & Regions](#24-countries--regions)
- [Section 2.5: Customers](#25-customers)
- [Section 2.6: AEBF Budget](#26-aebf-budget)

---

## 2. SETTINGS & MASTER DATA MAPPINGS

### 2.1 Company Info (SaaS Platform + Tenant Configuration)

**Status**: ✅ CLARIFIED

**Two-Layer Architecture**:

#### Layer 1: SaaS Platform Layer (`propackhub_platform` database)

**User**: `admin@propackhub.com` (ProPackAdmin)

**Responsibilities**:
- Create company in `companies` table (company_id, company_name)
- Set subscription plan (subscription_plans: Free/Professional/Enterprise)
- Define number of users allowed
- Manage subscription payment (future feature - not yet developed)
- Trigger automatic setup feature:
  - Create tenant database (e.g., `interplast_fp_database`)
  - Create folder structure for company assets
  - Initialize all tables and divisions

**Tables Involved**:
- `propackhub_platform.companies` (company_id, company_name, subscription_plan_id, created_at)
- `propackhub_platform.subscription_plans` (plan_id, plan_name, user_count, features, pricing)
- `propackhub_platform.company_divisions` (division_id, company_id, division_code, division_name, mapped_oracle_codes)

#### Layer 2: Tenant Configuration (`{company_slug}_fp_database`)

**User**: Tenant admin (e.g., `camille@interplast-uae.com`)

**Responsibilities**:
- Set company currency (AED, USD, EUR, etc.)
- Upload company logo
- View/manage divisions (created by setup feature, admin can configure)
- Manage company display settings

**Data Stored**:
- Company currency: In `company_settings` table (per tenant database)
- Company logo: File system at `src/assets/companies/{company_id}/logo.{ext}`
- Divisions: In `company_divisions` table (linking to Oracle raw data)

#### Company Setup Feature (Automatic)

**Triggered By**: ProPackAdmin creates company in SaaS platform

**Automatic Actions**:
1. ✅ Create tenant database: `{company_slug}_fp_database`
2. ✅ Create folder structure:
   ```
   src/assets/companies/{company_id}/
   ├── logo.png
   ├── uploads/
   │   ├── excel-imports/
   │   ├── budget-uploads/
   │   └── exports/
   └── documents/
   ```
3. ✅ Create all required tables (unified tables, master data, etc.)
4. ✅ Initialize system configurations

#### Example: Interplast Co LTD

```
ProPackAdmin Action:
  ├─ Creates company: "Interplast Co LTD"
  ├─ Sets subscription: "Professional"
  └─ System auto-creates:

Tenant Database: interplast_fp_database
├─ company_settings table
│   ├─ company_id: 1
│   ├─ company_name: "Interplast Co LTD" (read-only)
│   ├─ currency: AED (set by camille@interplast-uae.com)
│   └─ logo_path: src/assets/companies/1/logo.png
│
├─ company_divisions table
│   ├─ division_id: 1
│   ├─ division_code: FP
│   ├─ division_name: "Flexible Packaging"
│   ├─ mapped_oracle_codes: ['FP', 'FB']  ← Oracle divisions that map to this
│   └─ is_active: true
│
└─ Folder structure:
   src/assets/companies/1/
   ├─ logo.png (uploaded by camille@interplast-uae.com)
   ├─ uploads/
   │   ├─ excel-imports/
   │   ├─ budget-uploads/
   │   └─ exports/
   └─ documents/
```

#### Division Mapping Logic

**KEY CONCEPT**: One admin-defined division = Multiple Oracle divisions

**Mapping Example**:

```
Admin creates division in system:
  Division Name: "Flexible Packaging"
  Division Code: FP
  Mapped Oracle Codes: ['FP', 'FB']

When processing fp_raw_data:
  ├─ Oracle row with division='FP' → maps to admin division code 'FP'
  ├─ Oracle row with division='FB' → ALSO maps to admin division code 'FP'
  └─ In fp_actualdata: Both appear as division_code='FP', division_name='Flexible Packaging'

Aggregate Result:
  fp_actualdata shows:
  ├─ All transactions from Oracle FP
  ├─ All transactions from Oracle FB  
  └─ Combined under admin-defined division "Flexible Packaging" (FP)
```

**Purpose**: Admin can consolidate multiple Oracle divisions into one logical division for reporting

#### Current Settings Page Fields

| Field | Source | Editable By | Storage | Notes |
|-------|--------|---|---|---|
| Company Name | `propackhub_platform.companies.company_name` | ProPackAdmin only | SaaS platform | Display-only for tenant admin |
| Currency | `{company_db}.company_settings.currency` | Tenant admin | Tenant DB | Set on first login |
| Company Logo | File system: `src/assets/companies/{company_id}/` | Tenant admin | File system | User can upload/change |
| Divisions | `{company_db}.company_divisions` | Created by setup, view-only | Tenant DB | Configured during company setup |
| Subscription Plan | `propackhub_platform.subscription_plans` | ProPackAdmin | SaaS platform | Display-only for tenant admin |

#### Division Field in fp_actualdata

**Column Name**: `division_code` (or `division`)

**Value**: Admin-configured division code (e.g., "FP") - NOT raw Oracle division

**Processing**:
```
fp_raw_data.division (Oracle)
  ├─ Value: 'FP' or 'FB' (raw Oracle codes)
  │
  ├─ Lookup in company_divisions.mapped_oracle_codes
  │
  └─ Return: admin division_code='FP', division_name='Flexible Packaging'

fp_actualdata.division_code
  └─ Stored value: 'FP' (admin-defined, not raw Oracle)
```

#### Oracle ERP Link

**For Company Info**:
- ❌ No Oracle source for company name/logo/currency (SaaS configuration)
- ✅ Oracle `division` column maps TO admin-configured divisions
- ✅ Example: Oracle FP & FB → Admin FP division

---

### 2.3 Actual Data from Oracle (fp_actualdata Table)

**Status**: 🚧 PLANNED - Schema to be created

**Architecture**: 
- **Source**: `fp_raw_data.year1` (Oracle HAP111.XL_FPSALESVSCOST_FULL)
- **Organization**: **YES, FILLED BY YEAR** - Each row has a `year` column from `fp_raw_data.year1`
- **Purpose**: Transformed actual sales data with business logic applied (consolidations, conversions, merge rules)
- **Table**: `fp_actualdata` (LAYER 2 of three-layer architecture)

#### Planned Table Structure

```sql
CREATE TABLE fp_actualdata (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,          -- FP/SB/TF/HCM (from company division)
  year INTEGER NOT NULL,                  -- ✅ FROM fp_raw_data.year1
  month INTEGER,                          -- 1-12 (calculated or from source)
  type VARCHAR(50),                       -- Actual/Budget/Estimate/Forecast
  
  -- Key dimensions (mapped/consolidated from Oracle)
  sales_rep_code VARCHAR(50),
  sales_rep_name VARCHAR(255),
  customer_code VARCHAR(50),
  customer_name VARCHAR(255),
  country_code VARCHAR(10),
  country_name VARCHAR(100),
  product_group_code VARCHAR(50),
  product_group_name VARCHAR(255),
  
  -- Values
  amount_local NUMERIC(18,4),             -- In local currency
  amount_usd NUMERIC(18,4),               -- Converted to USD
  quantity NUMERIC(18,4),                 -- Optional: if source has qty
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  source_raw_data_id INTEGER,             -- Link back to fp_raw_data
  
  -- Indexes
  INDEX idx_year (year),                  -- Critical for year-based queries
  INDEX idx_division_year (division, year),
  INDEX idx_period (year, month),
  UNIQUE (division, year, month, type, sales_rep_code, customer_code, product_group_code)
);
```

#### How Period Data Connects:

1. **Year comes from Oracle**: `fp_raw_data.year1` → `fp_actualdata.year`
2. **Period dropdown shows available years**: QuerygetAvailableYears() returns DISTINCT years from fp_raw_data
3. **UI filtering by year**: When user selects year from dropdown → queries `fp_actualdata WHERE year = selected_year`
4. **Month aggregation**: From `fp_actualdata.month` or calculated by business rules

#### Transformation Flow:

```
fp_raw_data (Oracle sync)
    │ [year1, ..., 57 columns]
    │
    ▼ ActualDataTransformationService
[Merge rules, consolidations, conversions, validations]
    │
    ▼
fp_actualdata (Transformed)
    │ [year, month, type, consolidated dimensions, amounts]
    │
    ▼ vw_unified_sales_complete
Dashboard views & reports
```

---

### 2.2 Period Configuration

**1. PeriodDataService** (`server/services/PeriodDataService.js`)
- Fetches distinct years from fp_raw_data.year1 column
- Returns: { years, months, types, monthFormat }
- In-memory caching with refresh capability
- Validates year/month/type availability

```javascript
/**
 * GET distinct years from Oracle
 */
async getAvailableYears() {
  const query = `
    SELECT DISTINCT year1 
    FROM fp_raw_data 
    WHERE year1 IS NOT NULL 
    ORDER BY year1 ASC;
  `;
  return years;  // e.g., [2020, 2021, 2022, ..., 2025]
}

/**
 * Get months (hardcoded but mapped with Oracle names)
 */
getAvailableMonths() {
  return [
    { monthno: 1, name: 'January' },
    { monthno: 2, name: 'February' },
    ...,
    { monthno: 'FY', name: 'Full Year' },
    { monthno: 'Q1', name: 'Quarter 1' }
  ];
}

/**
 * Get types (hardcoded AEBF)
 */
getAvailableTypes() {
  return ['Actual', 'Estimate', 'Budget', 'Forecast'];
}
```

**2. API Endpoint** (`server/routes/erp-periods.js`)
- `GET /api/periods/all` - Returns all period data (years + months + types)
- `GET /api/periods/years` - Returns only years (for FilterContext)
- `GET /api/periods/months` - Returns only months (hardcoded)
- `GET /api/periods/types` - Returns only types (hardcoded)
- `POST /api/periods/refresh` - Admin-only, refresh cache after new Oracle data sync
- `POST /api/periods/validate` - Validate if year/month/type is available

**API Response Example**:
```json
{
  "success": true,
  "data": {
    "years": [2020, 2021, 2022, 2023, 2024, 2025],
    "months": [
      { "monthno": "FY", "name": "Full Year" },
      { "monthno": "HY1", "name": "Half Year 1 (Jan-Jun)" },
      { "monthno": 1, "name": "January" },
      ...
    ],
    "types": ["Actual", "Estimate", "Budget", "Forecast"],
    "source": {
      "years": "Oracle ERP (fp_raw_data.year1)",
      "months": "Hardcoded + Standard Periods",
      "types": "Hardcoded (AEBF)"
    },
    "cacheAge": 45
  }
}
```

**3. FilterContext Update** (`src/contexts/FilterContext.jsx`)
- Fetch period data from `/api/periods/all` on mount
- Fallback to hardcoded if API fails
- Set `availableFilters` with years from Oracle
- Render period dropdowns dynamically

```javascript
useEffect(() => {
  const fetchPeriodData = async () => {
    try {
      const response = await fetch('/api/periods/all', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        // Years from Oracle, months/types hardcoded
        setAvailableFilters({
          years: data.data.years,        // [2020, 2021, ..., 2025]
          months: data.data.months.map(m => m.name),
          types: data.data.types         // ['Actual', 'Estimate', 'Budget', 'Forecast']
        });
      }
    } catch (error) {
      console.error('API failed, using fallback');
      // Fallback values
    }
  };
  
  fetchPeriodData();
}, []);
```

**4. Frontend Impact**
- **PeriodConfiguration.jsx**: Now receives dynamic years from API
- **FilterDropdowns**: Years dropdown shows actual years from Oracle
- **Column Order**: User still manually selects year/period/type
- **User Preferences**: Still stored per user (base period, column order, etc.)

#### Month Field Decision: NUMERIC (monthno = 1-12)

**Choice**: Use `monthno` (1-12) for storage/calculations, display month names in UI

**Rationale**:
1. **Performance**: Numeric comparisons are faster than text matching
2. **Standardization**: Month numbers are language-independent
3. **Calculations**: Easier to compute quarter/half-year ranges with numbers
4. **Display**: Can map to month names (January, February) in UI templates

**Implementation**:
- Backend storage: `monthno` (1, 2, 3, ..., 12)
- UI display: Map monthno → month names
- API returns both: `{ monthno: 1, name: 'January' }`
- Example query: `WHERE monthno BETWEEN 1 AND 3` (Q1)

#### Data Flow

```
Oracle ERP (fp_raw_data)
    │
    ├─ year1: 2025, 2024, 2023, ... (50+ rows per year)
    │
    └─ PeriodDataService.getAvailableYears()
        │
        ├─ SELECT DISTINCT year1
        │
        └─ Cache: [2020, 2021, ..., 2025]
            │
            ├─ /api/periods/all
            │   │
            │   ├─ years: [2020, 2021, ..., 2025] (from Oracle)
            │   ├─ months: [FY, HY1, HY2, Q1-Q4, Jan-Dec] (hardcoded)
            │   └─ types: [Actual, Estimate, Budget, Forecast] (hardcoded)
            │
            └─ FilterContext.jsx
                │
                ├─ setAvailableFilters()
                │
                ├─ Render Year dropdown (now dynamic!)
                ├─ Render Period dropdown (hardcoded options)
                ├─ Render Type dropdown (hardcoded options)
                │
                └─ User selects column → stored in columnOrder
```

#### Oracle ERP Link

**Used From**: `fp_raw_data`
- `year1` - Scanned for available years (dynamic)
- `monthno` - Future use for month-level filtering
- `invoicedate` - For date range validations

**Used In Queries**: When pulling from fp_actualdata
```sql
WHERE year = 2025 
  AND monthno IN (1, 2, 3)  -- Q1, using numeric months
  AND transaction_type = 'Actual'
```

#### Files Created/Modified

| File | Type | Purpose |
|------|------|---------|
| `server/services/PeriodDataService.js` | NEW | Fetch years from Oracle, manage period cache |
| `server/routes/erp-periods.js` | NEW | API endpoints for period data |
| `server/config/express.js` | MODIFIED | Register `/api/periods` route |
| `src/contexts/FilterContext.jsx` | MODIFIED | Fetch period data from API instead of hardcoded |

#### Testing

**Manual Testing**:
1. Start server (auto-restart via node --watch)
2. Open DevTools Network tab
3. Navigate to FilterDropdown / Period Configuration
4. See GET /api/periods/all request
5. Verify response includes actual years from fp_raw_data
6. Verify fallback to hardcoded if API fails

**API Test Endpoints**:
```bash
# Get all period data (years from Oracle)
curl -X GET http://localhost:3001/api/periods/all \
  -H "Authorization: Bearer {token}"

# Get only years (dynamic from Oracle)
curl -X GET http://localhost:3001/api/periods/years \
  -H "Authorization: Bearer {token}"

# Refresh cache (admin only, after new Oracle sync)
curl -X POST http://localhost:3001/api/periods/refresh \
  -H "Authorization: Bearer {token}"

# Validate a year
curl -X POST http://localhost:3001/api/periods/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"year": 2025}'
```

---

### 2.3 Product Groups

**Status**: ⏳ AWAITING CLARIFICATION (Next)

**Current Source**: Excel implicit + Admin manual mapping

**Oracle Source**: `fp_raw_data` columns:
- `itemcode` - Oracle item code
- `itemgroupcode` - Oracle item group code
- `itemgroupdescription` - Oracle item group description
- `subgroup` - Oracle sub-group classification
- `producttype` - Oracle product type
- `productgroup` - Oracle product group name
- `itemdescription` - Oracle item description

#### Outstanding Questions (From AUDIT Document)
1. Should raw product group names come from `itemgroupdescription` (Oracle)?
2. How should we map 57 raw product groups → 13 pg_combine standard groups?
3. Should material type be extracted from Oracle data or remain admin-assigned?
4. Should process type be mapped from Oracle `subgroup`/`producttype`?
5. What's the hierarchy - itemgroup → subgroup → productgroup → pg_combine?

**ACTION**: User to review Product Groups page and provide Oracle mapping decisions

---

### 2.4 Sales Reps & Groups

**Status**: ⏳ AWAITING CLARIFICATION

**Current Source**: Excel implicit + Admin manual grouping

**Oracle Source**: `fp_raw_data` columns:
- `salesrepname` - Oracle sales rep name
- `salesrepcode` - Oracle sales rep code
- `division` - Oracle division (FP, HC, etc.)

#### Outstanding Questions (From AUDIT Document)
1. Should sales rep names come from `salesrepname` (Oracle) directly?
2. Should we use `salesrepcode` (Oracle) as the unique sales rep ID?
3. Sales rep groups (14 groups: "Sofiane & Team", "Christopher Group", etc.) - WHERE DO THESE COME FROM?
   - Are they in Oracle's organizational hierarchy?
   - Or are they purely admin-created configuration?
4. Should we pull manager/supervisor info from Oracle?
5. Should we track start date, territory, region from Oracle?

#### CRITICAL DECISION NEEDED
- Sales rep groups don't exist in fp_raw_data
- Are they extracted from another Oracle table?
- Or should they remain as admin configuration (not ERP-sourced)?

**ACTION**: User to review Sales Rep Management page and clarify group source

---

### 2.5 Countries & Regions

**Status**: ⏳ AWAITING CLARIFICATION

**Current Source**: Excel implicit + Fuzzy match + Admin assignment

**Oracle Source**: `fp_raw_data` columns:
- `countryname` - Oracle country name

#### Outstanding Questions (From AUDIT Document)
1. Should country names come directly from `countryname` (Oracle)?
2. How to handle alternate spellings? (e.g., "United Arab Emirates" vs "UAE")
3. Where do regions come from? (Middle East, South Asia, etc.)
   - Are they in Oracle?
   - Or admin-assigned?
4. Where do market types come from? (developed, emerging, developing)
5. How to handle currency mapping?
   - Which Oracle column has transaction currency?
   - Should we fetch exchange rates from Oracle?

**ACTION**: User to review Country Reference page and clarify region/currency sources

---

### 2.6 Customers

**Status**: ⏳ AWAITING CLARIFICATION

**Current Source**: Excel implicit + AI fuzzy matching + Admin approval of merges

**Oracle Source**: `fp_raw_data` columns:
- `customertitle` - Oracle customer title/trading name
- `customer` - Oracle customer code
- `customername` - Oracle customer name
- `financialcustomer` - Oracle financial customer (for billing)
- `businesspartnertype` - Oracle business partner type
- `creditlimit` - Oracle credit limit
- `paymentcode` - Oracle payment code
- `paymentdays` - Oracle payment days
- `termsofpayment` - Oracle payment terms
- `deliveryterms` - Oracle delivery terms
- `address_1`, `address_2` - Oracle address
- `postbox` - Oracle post box
- `phone` - Oracle phone
- `building` - Oracle building
- `contactname` - Oracle contact name
- `contactposition` - Oracle contact position
- `contdepartment` - Oracle department
- `conttel` - Oracle contact telephone
- `contmob` - Oracle contact mobile
- `contemail` - Oracle contact email

#### Outstanding Questions (From AUDIT Document)
1. Should customer code be from Oracle `customer` field?
2. Should customer names be from `customername` (Oracle) or `customertitle`?
3. Should we use Oracle `customer` code as the unique ID (replacing system-generated)?
4. How should customer MERGES be handled with Oracle?
   - Should Oracle `customer` code be the definitive identifier?
   - If same company has multiple Oracle customer codes, should we merge them?
5. Should contact/CRM fields auto-populate from Oracle (`address`, `phone`, `contactname`, etc.)?
6. Should we import credit limit and payment terms from Oracle?

#### CRITICAL DECISION NEEDED
- Current system uses `fp_division_customer_merge_rules` to merge duplicate customer names
- With Oracle, should we trust Oracle's `customer` code as source of truth?
- Or should we still apply merge logic on top of Oracle data?

**ACTION**: User to review Customer Management page and clarify merge/CRM logic

---

### 2.7 AEBF Budget

**Status**: ❌ NOT IN ORACLE

**Current Source**: Excel upload (sales rep submits via HTML form)

**Oracle Source**: ❌ NO FORECAST DATA in `fp_raw_data`
- `fp_raw_data` contains ACTUAL sales transactions only
- No budget/forecast/estimate data in Oracle AEBF columns

#### Outstanding Questions
1. Does your Oracle ERP system have a separate budget/forecast module?
2. Should budget remain as separate manual entry system (no Oracle mapping)?
3. Or should we try to fetch budget data from a different Oracle table/schema?

#### Current System Flow
- Sales reps submit budget forecasts via HTML form
- Stored in `fp_sales_rep_budget` table
- Used for variance analysis (budget vs actual)
- NOT sourced from Oracle

**ACTION**: User to clarify if budget should come from Oracle or remain separate

---

## 3. IMPLEMENTATION - COMPANY INFO (✅ COMPLETE)

### 3.1 Database Schema

**Migration 321**: `server/migrations/321_enhanced_company_divisions_with_oracle_mapping.sql`

**Tables Created**:

#### `company_divisions`
```sql
- division_id (PK)
- division_code (UNIQUE) - e.g., 'FP', 'HC'
- division_name - e.g., 'Flexible Packaging'
- mapped_oracle_codes (TEXT[]) - e.g., ['FP', 'FB']
- is_active (BOOLEAN)
- display_order (INTEGER)
- color_code (VARCHAR) - Hex color for UI
- icon (VARCHAR) - Icon name
- created_at, updated_at (TIMESTAMP)
- created_by, updated_by (FK to users)
```

#### `division_mapping_audit`
```sql
- mapping_id (PK)
- division_id (FK)
- oracle_code (VARCHAR)
- action (ENUM) - 'ADDED', 'REMOVED', 'CHANGED'
- old_mapped_codes (TEXT[])
- new_mapped_codes (TEXT[])
- changed_at (TIMESTAMP)
- changed_by (FK to users)
- reason (TEXT)
```

**Default Divisions** (Inserted automatically):
```
FP | Flexible Packaging | ['FP', 'FB']
HC | Home Care          | ['HC']
```

### 3.2 Service Layer

**Service**: `server/services/CompanySetupService.js`

**Methods**:
- `setupNewCompany(companyData)` - Orchestrates entire setup
- `createFolderStructure(company_id)` - Creates asset directories
- `createCompanySettings(company_id, company_name)` - Initializes config
- `createDefaultDivisions(company_id)` - Sets up FP, HC, etc.
- `createCurrencySettings(company_id)` - Default to AED
- `updateCompanyLogo(company_id, logoFileName)` - Updates logo path
- `addDivisionMapping(code, name, oracle_codes)` - New division
- `updateDivisionOracleMapping(code, new_codes, reason)` - Modify mapping
- `getDivisionsMappingConfig()` - Get all divisions with Oracle mappings

### 3.5 Data Loader (For Division Mapping)

Service: `server/services/DivisionMappingService.js`

**Responsibilities**:
- Cache division mappings in memory (fast lookups)
- Map Oracle division → Admin division:
  ```
  Input: Oracle division 'FB'
  Lookup: company_divisions.mapped_oracle_codes = ['FP', 'FB']
  Output: division_code='FP', division_name='Flexible Packaging'
  ```
- Log transformations to audit table
- Validate mappings
- Provide statistics for monitoring

**Methods**:
- `initializeCache()` - Load all divisions from DB
- `mapOracleDivisionToAdmin(oracleDivisionCode)` - Map single division
- `getAllMappings()` - Get all division configs
- `refreshCache()` - Reload after changes
- `getOracleCodes(divisionCode)` - Get Oracle codes for admin division
- `validateMappings()` - Check mapping integrity
- `getMappingStats()` - Statistics for monitoring
- `logDivisionMapping(auditData)` - Record transformation

---

## 4. DATABASE SCHEMA DESIGN

### 4.1 fp_actualdata Table (✅ CREATED)

**Migration 322**: `server/migrations/322_create_fp_actualdata.sql`

**Columns Created** (Phase 1 - Division Mapping):
```sql
-- Primary & Audit
actual_id (PK)
erp_row_id (UNIQUE) - Reference to fp_raw_data for audit trail
raw_data_id (FK to fp_raw_data)

-- Core Transaction Fields
invoice_date
invoice_no
year, month, monthno
transaction_type

-- Division (MAPPED)
division_code - Admin-defined (FP, HC, etc.)
division_name - Admin-defined (Flexible Packaging, etc.)
mapped_from_oracle_division - Original Oracle code (FP, FB, HC, etc.)

-- Quantities
delivered_qty_storage_units
delivered_qty_units
delivered_qty_kgs
unit_description

-- Financial
invoiced_amount
amount_aed
material_value, op_value
margin_over_rm, total_value, margin_over_total

-- Machine
machine_no, machine_name

-- Data Quality
data_quality_score (0-100)
quality_warnings (TEXT[])
transformation_applied (TEXT[])

-- Audit Trail
created_at, updated_at
created_by, updated_by
erp_sync_id

-- Next Phases (Placeholders commented out):
-- product_group_id (to be added after Product Groups clarification)
-- customer_id (to be added after Customer clarification)
-- sales_rep_id (to be added after Sales Rep clarification)
-- country_id (to be added after Country clarification)
```

**Indexes Created**:
- `idx_fp_actualdata_division_code` - Fast division filtering
- `idx_fp_actualdata_invoice_date` - Fast date filtering
- `idx_fp_actualdata_year_month` - Fast period filtering
- `idx_fp_actualdata_erp_row_id` - Fast audit trail lookup
- `idx_fp_actualdata_division_date` - Composite index (common query)
- `idx_fp_actualdata_division_year_month` - Composite index (dashboard query)

### 4.2 fp_actualdata_transformation_audit Table (✅ CREATED)

**Purpose**: Detailed audit trail of every transformation

**Columns**:
```sql
audit_id (PK)
actual_id (FK to fp_actualdata)
erp_row_id (VARCHAR) - Which original Oracle row
transformation_step (VARCHAR) - e.g., 'division_mapping', 'customer_merge', 'pg_consolidation'
input_data (JSONB) - Data BEFORE transformation
output_data (JSONB) - Data AFTER transformation
rule_applied (VARCHAR) - Description of rule used
created_at (TIMESTAMP)
```

**Example Entry**:
```json
{
  "audit_id": 1001,
  "actual_id": 5000,
  "erp_row_id": "FP_20260106_001",
  "transformation_step": "division_mapping",
  "input_data": { "oracle_division": "FB" },
  "output_data": { 
    "division_code": "FP", 
    "division_name": "Flexible Packaging" 
  },
  "rule_applied": "Mapped Oracle division 'FB' to admin division 'FP'",
  "created_at": "2026-01-06T10:30:00Z"
}
```

---

## 5. TRANSFORMATION LOGIC

### 5.1 Division Transformation (✅ IMPLEMENTED)

**Logic**:
```
Input: fp_raw_data.division (Oracle value: 'FP', 'FB', 'HC', etc.)

Step 1: Look up in DivisionMappingService
  └─ Query: company_divisions WHERE mapped_oracle_codes @> [input_division]
  
Step 2: Return admin division
  └─ division_code='FP', division_name='Flexible Packaging'
  
Step 3: Store in fp_actualdata
  ├─ division_code='FP'
  ├─ division_name='Flexible Packaging'
  ├─ mapped_from_oracle_division='FB' (original Oracle value)
  │
  └─ Log to fp_actualdata_transformation_audit
      └─ transformation_step='division_mapping'

Output: fp_actualdata row with admin division
```

**Data Flow**:
```
Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
  ├─ Row 1: division='FP'
  ├─ Row 2: division='FB'
  └─ Row 3: division='HC'
       │
       ▼
fp_raw_data (untouched copy)
  ├─ Row 1: division='FP'
  ├─ Row 2: division='FB'
  └─ Row 3: division='HC'
       │
       ▼ DivisionMappingService.mapOracleDivisionToAdmin()
       │
fp_actualdata (transformed)
  ├─ Row 1: division_code='FP', division_name='Flexible Packaging'
  ├─ Row 2: division_code='FP', division_name='Flexible Packaging' ← FB mapped to FP!
  └─ Row 3: division_code='HC', division_name='Home Care'
```

---

## 6. NEXT STEPS (INCREMENTAL)

✅ **Step 1 COMPLETE**: 
- Division table, service, and fp_actualdata created
- Ready for Product Groups

⏳ **Step 2 NEXT**: Product Groups
1. Clarify Product Groups page
2. Add product_group_id, product_group_name, pg_combine columns to fp_actualdata
3. Create ProductGroupMappingService
4. Test division + product group together

**Ready for Product Groups clarification?** 👉

**NOT YET CREATED** - Awaiting approval after clarifications

```
server/erp/                          (NEW - ERP implementation folder)
├── migrations/                      (ERP-specific database migrations)
│   ├── 330_create_fp_actualdata.sql
│   ├── 331_create_erp_mapping_log.sql
│   └── run-erp-migrations.js
│
├── services/                        (Transformation & sync services)
│   ├── ProductGroupMappingService.js
│   ├── SalesRepMappingService.js
│   ├── CountryMappingService.js
│   ├── CustomerMappingService.js
│   ├── ActualDataTransformationService.js
│   └── ERPDataLoaderService.js
│
├── routes/                          (ERP API endpoints)
│   └── erp-data.js                 (Separate from existing routes)
│
└── docs/                            (ERP documentation)
    ├── MAPPING_RULES.md
    ├── TRANSFORMATION_LOGIC.md
    └── INTEGRATION_CHECKLIST.md
```

---

## 4. DATABASE SCHEMA DESIGN

### 4.1 fp_actualdata Table (PLANNED)

**Status**: ⏳ Awaiting column specifications from user clarifications

**Purpose**: Transform-time enriched data (main table for dashboards)

**Column Categories** (to be defined):
- Core transaction fields (date, division, amount, quantity)
- Linked IDs (customer_id, sales_rep_id, product_group_id, country_id)
- Derived metrics (calculated values, aggregations)
- Audit fields (created_at, updated_at, erp_source_row_id)

**Key Relationships**:
- FK to `fp_customer_unified` (customer_id)
- FK to `fp_sales_rep_unified` (sales_rep_id)
- FK to `fp_product_group_unified` (product_group_id)
- FK to `master_countries` (country_id)
- FK to `fp_raw_data` (erp_row_id) - audit trail back to source

### 4.2 erp_mapping_audit Table (PLANNED)

**Purpose**: Track all transformations from `fp_raw_data` → `fp_actualdata`

**Columns**:
- `mapping_id` - SERIAL PK
- `raw_row_id` - FK to fp_raw_data
- `actualdata_id` - FK to fp_actualdata
- `field_transformations` - JSONB with before/after values
- `applied_rules` - Array of which business rules were applied
- `created_at` - Transformation timestamp
- `created_by` - Service that performed transformation

---

## 5. TRANSFORMATION LOGIC (TO BE DEFINED)

### 5.1 Product Group Transformation

**Status**: ⏳ Awaiting mapping decisions

**Current Process** (TBD):
- Input: Oracle `itemgroupdescription`, `itemgroupcode`, `subgroup`, `producttype`
- Process: TBD
- Output: `fp_product_group_unified.pg_id`
- Audit: erp_mapping_audit table

### 5.2 Sales Rep Transformation

**Status**: ⏳ Awaiting mapping decisions

**Current Process** (TBD):
- Input: Oracle `salesrepname`, `salesrepcode`, `division`
- Process: TBD (including group assignment)
- Output: `fp_sales_rep_unified.sales_rep_id`
- Audit: erp_mapping_audit table

### 5.3 Country Transformation

**Status**: ⏳ Awaiting mapping decisions

**Current Process** (TBD):
- Input: Oracle `countryname`
- Process: TBD (fuzzy match, region assignment, currency mapping)
- Output: `master_countries.country_id`
- Audit: erp_mapping_audit table

### 5.4 Customer Transformation

**Status**: ⏳ Awaiting mapping decisions

**Current Process** (TBD):
- Input: Oracle `customer`, `customername`, `customertitle`, + contact fields
- Process: TBD (merge rules application, contact info population)
- Output: `fp_customer_unified.customer_id`
- Audit: erp_mapping_audit table

### 5.5 Sales Quantity & Amount Transformation

**Status**: ⏳ Awaiting mapping decisions

**Current Process** (TBD):
- Input: Oracle `deliveredqtyinstorageunits`, `deliveredquantity`, `deliveredquantitykgs`, `invoicedamount`, `totalvalue`
- Process: TBD (unit conversion, currency conversion, amount calculations)
- Output: `fp_actualdata.quantity_storage_units`, `quantity_units`, `quantity_kgs`, `amount_aed`
- Audit: erp_mapping_audit table

---

## 6. INTEGRATION STEPS (PENDING)

Once all clarifications are complete, we will:

1. ✅ **Create ERP folder structure** (`server/erp/`)
2. ⏳ **Create fp_actualdata table** with specified columns
3. ⏳ **Create transformation services** for each setting category
4. ⏳ **Create data loader service** to process fp_raw_data → fp_actualdata
5. ⏳ **Register ERP routes** in Express server
6. ⏳ **Update vw_unified_sales_complete** to include ERP data
7. ⏳ **Test parallel operation** (ERP + Excel simultaneously)
8. ⏳ **Plan Excel deprecation** (after ERP validation complete)

---

## 7. OUTSTANDING CLARIFICATIONS

| Category | Question | Status |
|----------|----------|--------|
| **Company Info** | SaaS platform sources & division mapping | ✅ CLARIFIED |
| **Product Groups** | Oracle mapping & consolidation rules | ⏳ NEXT |
| **Sales Reps** | Name/code/division mapping | ⏳ AWAITING |
| **Sales Rep Groups** | Origin & structure (Oracle vs Admin?) | ⏳ CRITICAL |
| **Countries** | Region/market/currency sources | ⏳ AWAITING |
| **Customers** | Merge rules with Oracle; CRM fields auto-populate? | ⏳ CRITICAL |
| **AEBF Budget** | Should it come from Oracle or stay separate? | ⏳ AWAITING |

---

## 8. NEXT STEPS

**USER ACTION**:
1. Open each settings page (Company Info → Product Groups → Sales Reps → etc.)
2. Review the "Outstanding Questions" for that section
3. Answer with:
   - Which Oracle columns to use
   - Any other sources (admin config, calculations, etc.)
   - Business logic for transformations

**AGENT ACTION**:
1. Update this document with your clarifications
2. Update PROJECT_CONTEXT.md with new sections
3. Create ERP folder structure & services (once all clarifications complete)
4. No code created until you explicitly approve each mapping

---

## 9. REFERENCE: 57 ORACLE COLUMNS AVAILABLE

All from `fp_raw_data` (copied from `HAP111.XL_FPSALESVSCOST_FULL`):

```
division, subdivision, customertitle, itemcode, itemgroupcode, 
itemgroupdescription, subgroup, itemdescription, weight, 
financialcustomer, customer, customername, firstrandate, countryname, 
salesrepname, salesrepcode, unitdescription, selectioncodedescription, 
selectioncode, producttype, invoicedate, transactiontype, invoiceno, 
productgroup, year1, month1, monthno, deliveredqtyinstorageunits, 
deliveredquantity, deliveredquantitykgs, invoicedamount, materialvalue, 
opvalue, marginoverrm, totalvalue, marginovertotal, machineno, machinename, 
titlecode, titlename, address_1, address_2, postbox, phone, building, 
creditlimit, paymentcode, termsofpayment, paymentdays, contactname, 
contactposition, contdepartment, conttel, contmob, contemail, 
businesspartnertype, deliveryterms
```

---

**This document will be updated incrementally as clarifications are provided.**
