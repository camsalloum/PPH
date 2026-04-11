# P&L Database Integration Plan

## Overview

This document outlines the plan to store P&L (Profit & Loss) data from Excel files into PostgreSQL database tables. Each division will have its own dedicated P&L table, with data refreshable via a frontend button.

---

## Current State Analysis

### Excel Structure (`financials -{division}.xlsx`)

**Header Rows (Row 0-2):**
- Row 0: Year (2019, 2020, ..., 2026)
- Row 1: Month (January, February, ..., December)
- Row 2: Type (Actual, Estimate, Budget)

**Data Rows (Row 3-60):**
| Row | Label | Type |
|-----|-------|------|
| 3 | Sales | Input |
| 4 | Cost of Sales | Input |
| 5 | Material | Input |
| 6 | Material cost as % of Sales | **Calculated** (Material / Sales × 100) |
| 7 | Sales volume (kg) | Input |
| 8 | Production volume (kg) | Input |
| 9 | Labour | Input |
| 10 | Depreciation | Input |
| 12 | Electricity | Input |
| 13 | Others Mfg. overheads | Input |
| 14 | Actual Direct Cost Spent | **Calculated** (Sum: Material + Labour + Depreciation + Electricity + Others) |
| 15 | Dir.Cost in Stock/Stock Adj. | Input |
| 16 | Dir.Cost of goods sold | **Calculated** (Direct Cost Spent + Stock Adj) |
| 17 | Dir.Cost of goods sold (SEWA) | Input |
| 18 | Direct cost as % of C.O.G.S | **Calculated** |
| 19 | Gross profit (after Depn.) | **Calculated** (Sales - Direct Cost of Goods Sold) |
| 20 | Gross profit (after Depn.) % | **Calculated** (GP / Sales × 100) |
| 21 | Gross profit (before Depn.) | **Calculated** (GP after Depn + Depreciation) |
| 22 | Gross profit (before Depn.) % | **Calculated** |
| 24 | Sales ManpowerCost | Input |
| 25 | Sales Man Incentive | Input |
| 26 | Sales Office Rent | Input |
| 27 | Sales Travel and AirFare | Input |
| 28 | Advt / Exbn / Other Promotion | Input |
| 29 | Other Selling Expenses | Input |
| 31 | Selling expenses | **Calculated** (Sum: 24-29) |
| 32 | Transportation | Input |
| 34 | Administration Man Power Cost | Input |
| 35 | Telephone / Fax | Input |
| 37 | Other Administration Cost | Input |
| 38 | Administration | **Calculated** (Sum: 34+35+37) |
| 40 | Administration & Management Fee | Input |
| 42 | Bank interest | Input |
| 43 | Bank charges | Input |
| 44 | R & D, pre-production w/o | Input |
| 46 | Total FinanceCost & Amortization | **Calculated** (Sum: 42+43+44) |
| 48 | Adj to Stock Prov.-Divn/Stock Valuation | Input |
| 49 | Bad debts | Input |
| 50 | Other Income | Input |
| 51 | Other Provision | Input |
| 52 | Total Below GP Expenses | **Calculated** (Sum: 31+32+38+40+46+48+49-50+51) |
| 54 | Net Profit | **Calculated** (Gross Profit - Total Below GP Expenses) |
| 55 | Net Profit % | **Calculated** (Net Profit / Sales × 100) |
| 56 | EBITDA | **Calculated** (Net Profit + Depreciation + Bank Interest + Amortization) |
| 57 | EBITDA % | **Calculated** (EBITDA / Sales × 100) |
| 59 | Total Expenses | **Calculated** (Direct Cost + Below GP Expenses) |
| 60 | Total Expenses /Kg | **Calculated** (Total Expenses / Sales Volume) |

### Current Divisions
| Code | Name | Excel File |
|------|------|------------|
| FP | Flexible Packaging Division | `financials -fp.xlsx` |
| HC | Harwal Container Manufacturing | `financials -hc.xlsx` |

### Current Database Structure
- Database: `fp_database` (main data)
- Database: `ip_auth_database` (users, settings)
- Each division has separate tables (e.g., `fp_data_excel`, `hc_data_excel`)

---

## Proposed Solution

### Database Tables

**One table per division** following naming convention: `{division_code}_pl_data`

#### Table: `fp_pl_data` (Example for FP division)

```sql
CREATE TABLE fp_pl_data (
    id SERIAL PRIMARY KEY,
    
    -- Period identification
    year INTEGER NOT NULL,
    month VARCHAR(20) NOT NULL,  -- 'January', 'February', etc.
    data_type VARCHAR(20) NOT NULL,  -- 'Actual', 'Estimate', 'Budget'
    
    -- Input fields (uploaded from Excel)
    sales DECIMAL(18,2) DEFAULT 0,
    cost_of_sales DECIMAL(18,2) DEFAULT 0,
    material DECIMAL(18,2) DEFAULT 0,
    sales_volume_kg DECIMAL(18,2) DEFAULT 0,
    production_volume_kg DECIMAL(18,2) DEFAULT 0,
    labour DECIMAL(18,2) DEFAULT 0,
    depreciation DECIMAL(18,2) DEFAULT 0,
    electricity DECIMAL(18,2) DEFAULT 0,
    others_mfg_overheads DECIMAL(18,2) DEFAULT 0,
    dir_cost_stock_adj DECIMAL(18,2) DEFAULT 0,
    dir_cost_sewa DECIMAL(18,2) DEFAULT 0,
    sales_manpower_cost DECIMAL(18,2) DEFAULT 0,
    sales_incentive DECIMAL(18,2) DEFAULT 0,
    sales_office_rent DECIMAL(18,2) DEFAULT 0,
    sales_travel DECIMAL(18,2) DEFAULT 0,
    advt_promotion DECIMAL(18,2) DEFAULT 0,
    other_selling_expenses DECIMAL(18,2) DEFAULT 0,
    transportation DECIMAL(18,2) DEFAULT 0,
    admin_manpower_cost DECIMAL(18,2) DEFAULT 0,
    telephone_fax DECIMAL(18,2) DEFAULT 0,
    other_admin_cost DECIMAL(18,2) DEFAULT 0,
    admin_mgmt_fee DECIMAL(18,2) DEFAULT 0,
    bank_interest DECIMAL(18,2) DEFAULT 0,
    bank_charges DECIMAL(18,2) DEFAULT 0,
    rd_preproduction DECIMAL(18,2) DEFAULT 0,
    stock_provision_adj DECIMAL(18,2) DEFAULT 0,
    bad_debts DECIMAL(18,2) DEFAULT 0,
    other_income DECIMAL(18,2) DEFAULT 0,
    other_provision DECIMAL(18,2) DEFAULT 0,
    
    -- Calculated fields (generated columns in PostgreSQL 12+)
    material_cost_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (material / sales) * 100 ELSE 0 END
    ) STORED,
    
    actual_direct_cost_spent DECIMAL(18,2) GENERATED ALWAYS AS (
        material + labour + depreciation + electricity + others_mfg_overheads
    ) STORED,
    
    dir_cost_goods_sold DECIMAL(18,2) GENERATED ALWAYS AS (
        material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj
    ) STORED,
    
    gross_profit_after_depn DECIMAL(18,2) GENERATED ALWAYS AS (
        sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)
    ) STORED,
    
    gross_profit_after_depn_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) / sales) * 100 ELSE 0 END
    ) STORED,
    
    gross_profit_before_depn DECIMAL(18,2) GENERATED ALWAYS AS (
        sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) + depreciation
    ) STORED,
    
    gross_profit_before_depn_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) + depreciation) / sales) * 100 ELSE 0 END
    ) STORED,
    
    selling_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses
    ) STORED,
    
    administration DECIMAL(18,2) GENERATED ALWAYS AS (
        admin_manpower_cost + telephone_fax + other_admin_cost
    ) STORED,
    
    total_finance_cost DECIMAL(18,2) GENERATED ALWAYS AS (
        bank_interest + bank_charges + rd_preproduction
    ) STORED,
    
    total_below_gp_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
        transportation +
        (admin_manpower_cost + telephone_fax + other_admin_cost) +
        admin_mgmt_fee +
        (bank_interest + bank_charges + rd_preproduction) +
        stock_provision_adj + bad_debts - other_income + other_provision
    ) STORED,
    
    net_profit DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
    ) STORED,
    
    net_profit_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (
            ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
             ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
              transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
              (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision))
            / sales
        ) * 100 ELSE 0 END
    ) STORED,
    
    ebitda DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision) +
        depreciation + bank_interest + rd_preproduction
    ) STORED,
    
    ebitda_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (
            ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
             ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
              transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
              (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision) +
             depreciation + bank_interest + rd_preproduction)
            / sales
        ) * 100 ELSE 0 END
    ) STORED,
    
    total_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) +
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
    ) STORED,
    
    total_expenses_per_kg DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales_volume_kg != 0 THEN (
            (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) +
            ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
             transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
             (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
        ) / sales_volume_kg ELSE 0 END
    ) STORED,
    
    -- Metadata
    uploaded_at TIMESTAMP DEFAULT NOW(),
    uploaded_by INTEGER REFERENCES users(id),
    
    -- Constraints
    UNIQUE(year, month, data_type)
);

-- Index for fast queries
CREATE INDEX idx_fp_pl_data_period ON fp_pl_data(year, month, data_type);
```

---

## Row-to-Column Mapping

| Excel Row | Column Name | Type |
|-----------|-------------|------|
| 3 | sales | Input |
| 4 | cost_of_sales | Input |
| 5 | material | Input |
| 6 | material_cost_pct | **Calculated** |
| 7 | sales_volume_kg | Input |
| 8 | production_volume_kg | Input |
| 9 | labour | Input |
| 10 | depreciation | Input |
| 12 | electricity | Input |
| 13 | others_mfg_overheads | Input |
| 14 | actual_direct_cost_spent | **Calculated** |
| 15 | dir_cost_stock_adj | Input |
| 16 | dir_cost_goods_sold | **Calculated** |
| 17 | dir_cost_sewa | Input |
| 19 | gross_profit_after_depn | **Calculated** |
| 20 | gross_profit_after_depn_pct | **Calculated** |
| 21 | gross_profit_before_depn | **Calculated** |
| 22 | gross_profit_before_depn_pct | **Calculated** |
| 24 | sales_manpower_cost | Input |
| 25 | sales_incentive | Input |
| 26 | sales_office_rent | Input |
| 27 | sales_travel | Input |
| 28 | advt_promotion | Input |
| 29 | other_selling_expenses | Input |
| 31 | selling_expenses | **Calculated** |
| 32 | transportation | Input |
| 34 | admin_manpower_cost | Input |
| 35 | telephone_fax | Input |
| 37 | other_admin_cost | Input |
| 38 | administration | **Calculated** |
| 40 | admin_mgmt_fee | Input |
| 42 | bank_interest | Input |
| 43 | bank_charges | Input |
| 44 | rd_preproduction | Input |
| 46 | total_finance_cost | **Calculated** |
| 48 | stock_provision_adj | Input |
| 49 | bad_debts | Input |
| 50 | other_income | Input |
| 51 | other_provision | Input |
| 52 | total_below_gp_expenses | **Calculated** |
| 54 | net_profit | **Calculated** |
| 55 | net_profit_pct | **Calculated** |
| 56 | ebitda | **Calculated** |
| 57 | ebitda_pct | **Calculated** |
| 59 | total_expenses | **Calculated** |
| 60 | total_expenses_per_kg | **Calculated** |

---

## Backend Implementation

### 1. Migration File
**File:** `server/migrations/008_create_pl_tables.sql`

Creates P&L tables for all existing divisions (FP, HC).

### 2. Service File
**File:** `server/services/plDataService.js`

```javascript
class PLDataService {
  // Refresh P&L data from Excel for a division
  async refreshPLData(divisionCode, userId)
  
  // Get P&L data for specific periods
  async getPLData(divisionCode, filters)
  
  // Get available years/months/types
  async getAvailablePeriods(divisionCode)
}
```

### 3. API Routes
**File:** `server/routes/pl.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pl/:division/refresh` | Refresh P&L data from Excel |
| GET | `/api/pl/:division/data` | Get P&L data with filters |
| GET | `/api/pl/:division/periods` | Get available periods |
| GET | `/api/pl/:division/status` | Get last refresh timestamp |

### 4. Excel Row Mapping
**File:** `server/config/plRowMapping.js`

```javascript
const PL_ROW_MAPPING = {
  3: 'sales',
  5: 'material',
  7: 'sales_volume_kg',
  8: 'production_volume_kg',
  9: 'labour',
  10: 'depreciation',
  12: 'electricity',
  13: 'others_mfg_overheads',
  // ... etc
};
```

---

## Frontend Implementation

### 1. Refresh Button Component
**Location:** Settings page or Divisional Dashboard

```jsx
<button onClick={handleRefreshPL}>
  🔄 Refresh P&L Data
</button>
```

### 2. API Integration
**File:** `src/services/plService.js`

```javascript
export const refreshPLData = (division) => 
  axios.post(`/api/pl/${division}/refresh`);

export const getPLData = (division, filters) => 
  axios.get(`/api/pl/${division}/data`, { params: filters });
```

### 3. Dashboard Update
Modify `KPIExecutiveSummary.js` and other components to fetch data from database API instead of Excel file directly.

---

## Refresh Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     User clicks "Refresh P&L"                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: POST /api/pl/{division}/refresh                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: Read Excel file (financials -{division}.xlsx)          │
│  - Parse header rows (Year, Month, Type)                         │
│  - Extract all data columns                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: Transform data                                         │
│  - Map Excel rows to database columns                            │
│  - Only insert INPUT fields (not calculated)                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: UPSERT to database                                     │
│  - DELETE existing records for this division                     │
│  - INSERT new records                                            │
│  - Calculated columns auto-compute via GENERATED ALWAYS          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Show success message                                  │
│  "P&L data refreshed: 98 periods updated"                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Adding New Divisions

When a new division is added:

1. **Create Excel file:** `server/data/financials -{division_code}.xlsx`
2. **Run migration or API:** System will auto-create table `{division_code}_pl_data`
3. **Click Refresh:** Data populates automatically

### Dynamic Table Creation (Optional)
The system can automatically create P&L tables for new divisions:

```sql
-- Called when new division is added
CREATE OR REPLACE FUNCTION create_division_pl_table(division_code TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I_pl_data (...)', lower(division_code));
END;
$$ LANGUAGE plpgsql;
```

---

## Files to Create/Modify

### New Files:
| File | Purpose |
|------|---------|
| `server/migrations/008_create_pl_tables.sql` | Create P&L tables |
| `server/services/plDataService.js` | P&L data operations |
| `server/routes/pl.js` | P&L API endpoints |
| `server/config/plRowMapping.js` | Excel row → DB column mapping |
| `src/services/plService.js` | Frontend API calls |
| `src/components/settings/PLRefresh.js` | Refresh button component |

### Modified Files:
| File | Changes |
|------|---------|
| `server/index.js` | Register P&L routes |
| `src/components/dashboard/KPIExecutiveSummary.js` | Use DB data instead of Excel |
| `src/components/dashboard/TableView.js` | Optional: fetch from DB |
| `src/contexts/ExcelDataContext.js` | Add P&L database fetching |

---

## Implementation Phases

### Phase 1: Database Setup
1. Create migration file with P&L tables for FP and HC
2. Run migration to create tables
3. Verify calculated columns work correctly

### Phase 2: Backend API
1. Create plDataService.js with refresh logic
2. Create pl.js routes
3. Test Excel parsing and database insertion

### Phase 3: Frontend Integration
1. Add Refresh button to Settings page
2. Create PLRefresh component
3. Test full refresh flow

### Phase 4: Dashboard Integration
1. Modify KPIExecutiveSummary to use DB data
2. Update other components as needed
3. Remove direct Excel fetching for P&L

---

## Estimated Effort

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Database Setup | 1-2 hours |
| Phase 2: Backend API | 2-3 hours |
| Phase 3: Frontend Integration | 1-2 hours |
| Phase 4: Dashboard Integration | 2-3 hours |
| **Total** | **6-10 hours** |

---

## Questions for Confirmation

1. ✅ One table per division (e.g., `fp_pl_data`, `hc_pl_data`)
2. ✅ Replace data on refresh (Excel is source of truth)
3. ✅ Calculated columns in database (PostgreSQL GENERATED ALWAYS)
4. ✅ Keep existing Excel file naming (`financials -{division}.xlsx`)
5. ✅ Refresh P&L button in **Main Dashboard**, next to "Configure Period" button
6. ✅ **Admin role only** - button appears only for admin users
7. ✅ **Keep historical refresh logs** (audit trail)

---

## Approval

✅ **APPROVED** - Proceeding with implementation.
