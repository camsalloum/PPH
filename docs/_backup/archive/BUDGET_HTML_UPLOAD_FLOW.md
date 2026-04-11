# Budget HTML Upload Flow - Complete Documentation

## Overview
This document explains the complete process of exporting, filling, and uploading budget HTML files for **Sales Rep Budgets**. The system automatically calculates Amount and MoRM values based on Product Pricing data, and integrates Material and Process information from the Material Percentages table.

## 🔑 Key Concept: Two Separate Budget Databases

### 1. **Divisional Budget** (`fp_data_excel` table)
- Aggregated division-level budget
- Managed separately from sales rep budgets
- NOT affected by HTML upload process

### 2. **Sales Rep Budget** (`sales_rep_budget` table)
- Individual sales representative budgets
- **This is where HTML uploads are stored**
- Supports 3 value types per entry:
  - **KGS**: Quantity (user-entered)
  - **Amount**: Revenue (auto-calculated: KGS × Selling Price)
  - **MoRM**: Margin over Raw Material (auto-calculated: KGS × MoRM Price)

---

## 1. Export Unfilled Budget HTML

### User Action:
1. Navigate to **Master Data Management > AEBF > Budget Tab**
2. Select filters:
   - Division (e.g., FP-UAE)
   - Sales Rep
   - Actual Year (e.g., 2024)
3. Click **"Export HTML"** button

### Backend Process (`/api/aebf/export-html-budget`):
1. Fetches actual sales data for the selected year
2. Generates an interactive HTML form with:
   - **Pre-filled actual data** (read-only, displayed in MT)
   - **Empty budget input fields** for next year (Budget Year = Actual Year + 1)
   - **Dropdown lists** for:
     - Existing customers (from actual data)
     - 197 countries (hardcoded from master list)
     - Product groups
   - **"Add New Customer" functionality** (inline input)
   - **"Add Row" button** for additional entries
   - **"Save" button** for finalizing the budget

### File Naming:
```
Budget_[Division]_[SalesRep]_[ActualYear].html
```
Example: `Budget_FP-UAE_John_Smith_2024.html`

---

## 2. Fill Budget HTML (Offline)

### User Action:
1. Open the exported HTML file in any web browser
2. For each customer/country/product group combination:
   - **Existing rows**: Enter budget values in yellow input fields (12 months)
   - **New customers**: 
     - Click "Add Row" button
     - Select existing customer OR type new customer name
     - Select country
     - Select product group
     - Enter budget values (12 months)
3. The form automatically:
   - Calculates monthly totals
   - Formats numbers with thousand separators
   - Validates that all required fields are filled before enabling inputs
4. Click **"Save"** button when complete

### Save Process (Client-side JavaScript):
1. **Recalculates all totals** to ensure accuracy
2. **Clones the entire HTML document**
3. **Converts all interactive elements to static content**:
   - Input fields → Plain text with values
   - Dropdown selects → Selected text
   - Removes all buttons (Add Row, Delete, Save)
   - Removes all scripts (except data embedding)
4. **Converts MT to KGS** (multiplies by 1000)
5. **Embeds data as JavaScript variables**:
   ```javascript
   const budgetMetadata = {
     division: "FP-UAE",
     salesRep: "John Smith",
     actualYear: 2024,
     budgetYear: 2025,
     savedAt: "2025-11-21T10:30:45.123Z",
     version: "1.0",
     dataFormat: "budget_import"
   };
   
   const savedBudget = [
     {
       customer: "Customer A",
       country: "United Arab Emirates",
       productGroup: "Flexible Packaging",
       month: 1,
       value: 5000 // Already in KGS
     },
     // ... more records
   ];
   ```
6. **Generates dynamic filename**:
   ```
   BUDGET_[Division]_[SalesRep]_[BudgetYear]_YYYYMMDD_HHMMSS.html
   ```
   Example: `BUDGET_FP-UAE_John_Smith_2025_20251121_103045.html`

7. **Downloads the file** to user's computer

---

## 3. Upload Filled Budget HTML

### User Action:
1. Navigate back to **Master Data Management > AEBF > Budget Tab**
2. Click **"Import Filled HTML"** button
3. Drag and drop (or browse) the saved HTML file
4. Click **"Import Budget Data"**

### Backend Process (`/api/aebf/import-budget-html`):

#### Step 1: Parse HTML File
- Extracts `budgetMetadata` and `savedBudget` arrays from embedded JavaScript
- Validates metadata (division, salesRep, budgetYear must exist)

#### Step 2: Fetch Material and Process Data
```javascript
// Determine division code from metadata.division
const divisionCode = metadata.division.split('-')[0].toLowerCase(); // "FP-UAE" → "fp"
const materialPercentagesTable = `${divisionCode}_material_percentages`;

// Query material percentages table
SELECT product_group, material, process 
FROM fp_material_percentages;

// Create lookup map
{
  "flexible packaging": { material: "LDPE", process: "Extrusion" },
  "rigid packaging": { material: "HDPE", process: "Injection Molding" },
  // ... more product groups
}
```

#### Step 3: Database Transaction
1. **BEGIN TRANSACTION**

2. **Fetch Pricing Data** (from previous year):
   ```sql
   SELECT product_group, asp_round, morm_round
   FROM product_group_pricing_rounded
   WHERE division = 'FP'
   AND year = 2024  -- (budgetYear - 1)
   ```
   
   Creates pricing lookup map:
   ```javascript
   {
     "flexible packaging": {
       sellingPrice: 16,  // Math.round(15.75)
       morm: 3            // Math.round(3.25)
     },
     "rigid packaging": {
       sellingPrice: 22,
       morm: 5
     }
   }
   ```

3. **Delete existing sales rep budget records**:
   ```sql
   DELETE FROM sales_rep_budget 
   WHERE UPPER(division) = 'FP-UAE'
   AND UPPER(salesrepname) = 'JOHN SMITH'
   AND budget_year = 2025
   AND UPPER(type) = 'BUDGET'
   ```

4. **Insert 3 records per budget entry** (KGS, Amount, MoRM):

   **Record 1 - KGS (Quantity):**
   ```sql
   INSERT INTO sales_rep_budget (
     division,
     budget_year,
     month,
     type,
     salesrepname,
     customername,
     countryname,
     productgroup,
     values_type,
     values,
     material,      -- ← From material_percentages table
     process        -- ← From material_percentages table
   ) VALUES (
     'FP-UAE',
     2025,
     1,
     'Budget',
     'John Smith',
     'Customer A',
     'United Arab Emirates',
     'Flexible Packaging',
     'KGS',
     5000000,       -- ← From user input (5000 MT × 1000)
     'LDPE',        -- ← Looked up by product group
     'Extrusion'    -- ← Looked up by product group
   )
   ```

   **Record 2 - Amount (Revenue):**
   ```sql
   INSERT INTO sales_rep_budget (
     division, budget_year, month, type, salesrepname,
     customername, countryname, productgroup,
     values_type, values, material, process
   ) VALUES (
     'FP-UAE', 2025, 1, 'Budget', 'John Smith',
     'Customer A', 'United Arab Emirates', 'Flexible Packaging',
     'Amount',
     80000000,      -- ← Auto-calculated: 5,000,000 KGS × 16 AED/kg
     'LDPE', 'Extrusion'
   )
   ```

   **Record 3 - MoRM (Margin):**
   ```sql
   INSERT INTO sales_rep_budget (
     division, budget_year, month, type, salesrepname,
     customername, countryname, productgroup,
     values_type, values, material, process
   ) VALUES (
     'FP-UAE', 2025, 1, 'Budget', 'John Smith',
     'Customer A', 'United Arab Emirates', 'Flexible Packaging',
     'MoRM',
     15000000,      -- ← Auto-calculated: 5,000,000 KGS × 3 AED/kg
     'LDPE', 'Extrusion'
   )
   ```

5. **COMMIT TRANSACTION**

#### Step 4: Response
```json
{
  "success": true,
  "message": "Sales rep budget data imported successfully",
  "metadata": {
    "division": "FP-UAE",
    "salesRep": "John Smith",
    "budgetYear": 2025,
    "savedAt": "2025-11-21T10:30:45.123Z"
  },
  "recordsDeleted": 360,
  "recordsInserted": {
    "kgs": 120,
    "amount": 120,
    "morm": 120,
    "total": 360
  },
  "pricingYear": 2024,
  "pricingDataAvailable": 15
}
```

---

## 4. Material and Process Management

### Setting Material and Process:
1. Navigate to **Master Data Management > Material Percentages**
2. For each product group:
   - Enter material percentages (PE, BOPP, PET, Alu, Paper, PVC/PET)
   - Enter **Material** (e.g., "LDPE", "HDPE", "PET")
   - Enter **Process** (e.g., "Extrusion", "Injection Molding", "Blow Molding")
3. Click **"Save All"** to save all product groups at once

### Database Storage:
```sql
-- fp_material_percentages table structure
CREATE TABLE fp_material_percentages (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL UNIQUE,
  pe_percentage DECIMAL(5,2) DEFAULT 0,
  bopp_percentage DECIMAL(5,2) DEFAULT 0,
  pet_percentage DECIMAL(5,2) DEFAULT 0,
  alu_percentage DECIMAL(5,2) DEFAULT 0,
  paper_percentage DECIMAL(5,2) DEFAULT 0,
  pvc_pet_percentage DECIMAL(5,2) DEFAULT 0,
  material VARCHAR(255) DEFAULT '',     -- ← New column
  process VARCHAR(255) DEFAULT '',      -- ← New column
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### How It's Used in Upload:
- When a budget HTML is uploaded, the system:
  1. Extracts the product group from each budget record
  2. Looks up the corresponding Material and Process from `[division]_material_percentages` table
  3. Inserts both into the `fp_data_excel` table along with the budget values

---

## 5. Data Flow Summary

```
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 1: Setup Master Data                                           │
├──────────────────────────────────────────────────────────────────────┤
│ A. Material Percentages (material_percentages table)                │
│    Product Group → Material, Process                                │
│    Example: "Flexible Packaging" → "LDPE", "Extrusion"             │
│                                                                      │
│ B. Product Pricing (product_group_pricing_rounded table)            │
│    Product Group → Selling Price (Round), MoRM (Round)             │
│    Example: "Flexible Packaging" → 15.75 AED/kg, 3.25 AED/kg       │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 2: Export HTML (Backend generates form)                        │
│    • Fetch actual sales data for selected year                      │
│    • Generate interactive HTML form                                 │
│    • Embed countries list (197 countries)                           │
│    • Embed customers, product groups                                │
│    • Budget Year = Actual Year + 1                                  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 3: Fill Budget (User fills offline)                            │
│    • User enters ONLY KGS values (quantities in MT)                 │
│    • User selects: Customer, Country, Product Group                 │
│    • User can add new customers/rows                                │
│    • JavaScript validates and calculates totals                     │
│    • User clicks "Save"                                             │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 4: Save HTML (Client-side processing)                          │
│    • Convert MT to KGS (×1000)                                      │
│    • Replace all inputs with static text                            │
│    • Embed metadata and budget data as JS variables                 │
│    • Generate timestamped filename                                  │
│    • Download file to user's computer                               │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 5: Upload HTML (Backend imports to sales_rep_budget table)     │
│    ↓                                                                 │
│    A. Parse HTML and extract data                                   │
│       - budgetMetadata (division, salesRep, budgetYear, etc.)       │
│       - savedBudget array (KGS values only)                         │
│    ↓                                                                 │
│    B. Lookup Material & Process (from material_percentages)         │
│       - Query: SELECT material, process WHERE product_group = ...   │
│    ↓                                                                 │
│    C. Lookup Pricing (from product_group_pricing_rounded)           │
│       - Query: SELECT asp_round, morm_round                         │
│         WHERE division = ... AND year = budgetYear - 1              │
│       - Round values: Math.round(15.75) = 16                        │
│    ↓                                                                 │
│    D. Delete old sales rep budget records                           │
│       - DELETE FROM sales_rep_budget                                │
│         WHERE division, salesrep, budget_year match                 │
│    ↓                                                                 │
│    E. Insert 3 records per budget entry:                            │
│       ┌─────────────────────────────────────────────────────┐      │
│       │ Record 1: KGS (Quantity)                            │      │
│       │   values_type = 'KGS'                               │      │
│       │   values = 5,000,000 (from user input)             │      │
│       ├─────────────────────────────────────────────────────┤      │
│       │ Record 2: Amount (Revenue)                          │      │
│       │   values_type = 'Amount'                            │      │
│       │   values = 5,000,000 × 16 = 80,000,000 AED        │      │
│       ├─────────────────────────────────────────────────────┤      │
│       │ Record 3: MoRM (Margin)                             │      │
│       │   values_type = 'MoRM'                              │      │
│       │   values = 5,000,000 × 3 = 15,000,000 AED         │      │
│       └─────────────────────────────────────────────────────┘      │
│    ↓                                                                 │
│    F. Commit transaction                                            │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 6: DATABASE (sales_rep_budget table)                           │
│                                                                      │
│ For each budget entry, 3 records are stored:                        │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Record 1: KGS                                                  │ │
│ │ division: FP-UAE | budget_year: 2025 | month: 1               │ │
│ │ salesrepname: John Smith | customername: Customer A            │ │
│ │ countryname: UAE | productgroup: Flexible Packaging            │ │
│ │ values_type: KGS | values: 5,000,000                          │ │
│ │ material: LDPE | process: Extrusion                            │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Record 2: Amount                                               │ │
│ │ (same division, year, month, salesrep, customer, country, PG)  │ │
│ │ values_type: Amount | values: 80,000,000                      │ │
│ │ material: LDPE | process: Extrusion                            │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Record 3: MoRM                                                 │ │
│ │ (same division, year, month, salesrep, customer, country, PG)  │ │
│ │ values_type: MoRM | values: 15,000,000                        │ │
│ │ material: LDPE | process: Extrusion                            │ │
│ └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Key Technical Details

### Database Tables:

#### **sales_rep_budget** (Sales Rep Budgets)
- Stores individual sales rep budgets from HTML uploads
- **Separate from divisional budgets**
- Supports 3 value types: KGS, Amount, MoRM
- Unique constraint on: (division, budget_year, month, type, salesrepname, customername, countryname, productgroup, values_type)

#### **fp_data_excel** (Divisional Data)
- Stores divisional actual, estimate, forecast, and divisional budget data
- **NOT used for sales rep budget uploads**
- Different purpose and aggregation level

### Units Conversion:
- **Export**: Database (KGS) → HTML (MT) - divide by 1000
- **Save**: HTML (MT) → Embedded data (KGS) - multiply by 1000
- **Upload**: Embedded data (KGS) → Database (KGS) - no conversion

### Value Types and Calculations:

#### **KGS (Quantity)**
- Source: User input
- Unit: Kilograms
- Example: 5,000 MT = 5,000,000 KGS

#### **Amount (Revenue)**
- Source: Auto-calculated
- Formula: `KGS × Selling Price (rounded)`
- Unit: AED (currency)
- Example: 5,000,000 KGS × 16 AED/kg = 80,000,000 AED
- **Only inserted if selling price data available**

#### **MoRM (Margin over Raw Material)**
- Source: Auto-calculated
- Formula: `KGS × MoRM Price (rounded)`
- Unit: AED (currency)
- Example: 5,000,000 KGS × 3 AED/kg = 15,000,000 AED
- **Only inserted if MoRM price data available**

### Pricing Data Lookup:
- **Source table**: `product_group_pricing_rounded`
- **Year mapping**: Budget Year 2025 uses pricing from Year 2024 (budgetYear - 1)
- **Rounding**: `Math.round()` applied to asp_round and morm_round
  - Example: 15.75 → 16, 3.25 → 3
- **Case-insensitive matching**: Product group names normalized to lowercase
- **Graceful handling**: If no pricing data found, Amount and MoRM records are skipped

### Material and Process Lookup:
- **Source table**: `[division]_material_percentages` (e.g., fp_material_percentages)
- **Case-insensitive matching**: Product group names normalized to lowercase
- **Default values**: If no match found, material and process are set to empty strings
- **Division-specific tables**: Each division has its own table (fp_, sb_, tf_, hcm_)

### File Naming Convention:
- **Export**: `Budget_[Division]_[SalesRep]_[ActualYear].html`
- **Save**: `BUDGET_[Division]_[SalesRep]_[BudgetYear]_YYYYMMDD_HHMMSS.html`
- The saved filename includes timestamp for version tracking and is stored in `uploaded_filename` column

### Database Indexing:
- Composite unique constraint ensures no duplicate budget entries:
  ```sql
  UNIQUE (division, budget_year, month, type, salesrepname, customername, countryname, productgroup, values_type)
  ```
- ON CONFLICT clause updates existing records instead of failing
- Indexes on: division, budget_year, salesrepname, productgroup, values_type
- Composite index for fast lookups: (division, budget_year, salesrepname, values_type)

### Data Integrity:
- **Transaction-based**: All inserts wrapped in BEGIN/COMMIT transaction
- **Atomic operations**: Either all 3 records (KGS, Amount, MoRM) are inserted or none
- **Old data cleanup**: Existing sales rep budget for same division/rep/year is deleted before insert
- **Timestamp tracking**: `created_at`, `updated_at`, `uploaded_at` columns for audit trail

---

## 7. Error Handling

### Export Errors:
- Missing division/salesRep/actualYear → 400 Bad Request
- No data found → Returns empty HTML with message
- Database connection error → 500 Internal Server Error

### Upload Errors:
- Invalid HTML format (missing metadata/budget data) → 400 Bad Request
- Missing required metadata fields → 400 Bad Request
- Database transaction failure → Automatic ROLLBACK, 500 error
- Material percentages table not found → Empty material/process values (graceful degradation)
- Pricing data not found → KGS records inserted, Amount/MoRM records skipped (graceful degradation)

### Replace Existing Budget:
- **Detection**: System automatically checks if budget already exists for same sales rep/division/year
- **Confirmation Dialog**: Shows warning with existing budget details:
  - Division, Sales Rep, Budget Year
  - Existing record count
  - Last upload date and time
  - Last uploaded filename
  - Clear warning that old data will be deleted
- **User Choice**: 
  - **Confirm**: Old budget deleted, new budget inserted
  - **Cancel**: Upload cancelled, old budget preserved
- **Notification**: Success message shows records deleted vs inserted

### Validation:
- **Client-side**: Input fields disabled until customer, country, and product group are selected
- **Server-side**: Validates metadata structure and data format before database operations

### Graceful Degradation:
1. **No Material/Process data**: Records inserted with empty strings
2. **No Pricing data**: Only KGS records inserted, Amount and MoRM skipped
3. **Partial Pricing data**: 
   - If only Selling Price available: KGS and Amount inserted, MoRM skipped
   - If only MoRM available: KGS and MoRM inserted, Amount skipped

---

## 8. Comparison: Divisional vs Sales Rep Budgets

| Aspect | Divisional Budget | Sales Rep Budget |
|--------|-------------------|------------------|
| **Table** | `fp_data_excel` | `sales_rep_budget` |
| **Purpose** | Division-level aggregated budget | Individual sales rep budgets |
| **Data Source** | Manual entry or aggregation | HTML upload |
| **Granularity** | Division level | Sales rep level |
| **Value Types** | KGS, Amount, MoRM | KGS, Amount, MoRM |
| **Amount Calculation** | Manual or pre-calculated | Auto-calculated (KGS × Selling Price) |
| **MoRM Calculation** | Manual or pre-calculated | Auto-calculated (KGS × MoRM Price) |
| **Material/Process** | From material_percentages | From material_percentages |
| **Upload Method** | Direct database entry | HTML form upload |
| **Use Case** | Division-wide planning | Individual rep targets |

## 9. Example Scenario

### Setup (Year 2024):
1. **Material Percentages**: "Flexible Packaging" → Material: "LDPE", Process: "Extrusion"
2. **Product Pricing** (Year 2024): "Flexible Packaging" → Selling Price: 15.75 AED/kg, MoRM: 3.25 AED/kg

### Budget Entry (Year 2025):
- Sales Rep: John Smith
- Customer: Customer A
- Country: UAE
- Product Group: Flexible Packaging
- January Budget: 5,000 MT (user enters this)

### Database Result (3 records inserted):

**Record 1:**
```
division: FP-UAE, budget_year: 2025, month: 1
salesrepname: John Smith, customername: Customer A
productgroup: Flexible Packaging
values_type: KGS, values: 5,000,000
material: LDPE, process: Extrusion
```

**Record 2:**
```
(same metadata as Record 1)
values_type: Amount, values: 80,000,000
(5,000,000 KGS × 16 AED/kg = 80,000,000 AED)
```

**Record 3:**
```
(same metadata as Record 1)
values_type: MoRM, values: 15,000,000
(5,000,000 KGS × 3 AED/kg = 15,000,000 AED)
```

## 10. Future Enhancements

### Potential Improvements:
1. **Audit Trail**: Log all budget uploads with user, timestamp, and changes
2. **Version History**: Keep previous budget versions for comparison
3. **Approval Workflow**: Add approval status before committing to database
4. **Bulk Upload**: Support multiple HTML files in one upload
5. **Data Validation**: Add business rules (e.g., budget cannot exceed 200% of actual)
6. **Email Notifications**: Notify managers when budgets are uploaded
7. **Budget Consolidation**: Aggregate sales rep budgets into divisional budget
8. **Variance Analysis**: Compare sales rep budgets vs divisional budget
9. **Historical Pricing**: Track pricing changes over time for trend analysis
10. **Budget Approval Dashboard**: UI for managers to review and approve budgets

---

## Contact & Support
For questions or issues with the budget upload process, contact the development team.

**Last Updated**: November 21, 2025
**Version**: 2.0 (Updated with KGS/Amount/MoRM auto-calculation)

