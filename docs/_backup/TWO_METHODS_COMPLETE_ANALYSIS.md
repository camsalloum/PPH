# Sales Budget: Two Methods Complete Analysis

## 📋 Overview

There are **TWO METHODS** to add sales rep budget data to the database:

1. **METHOD 1: LIVE ENTRY** (React Interface with Auto-save)
2. **METHOD 2: HTML IMPORT** (Export → Fill Offline → Import)

---

## 🔵 METHOD 1: LIVE ENTRY (React Interface)

### **User Flow:**

```
1. User opens Budget Tab (HTML Format)
2. Selects filters: Division, Actual Year, Sales Rep
3. Table loads with Actual data (blue rows)
4. User enters budget values in yellow cells
5. System auto-saves every 30 seconds to DRAFT table
6. User clicks "Submit Final Budget"
7. System converts DRAFT → FINAL with calculations
8. Data saved to sales_rep_budget table
```

### **Technical Flow:**

#### **Step 1: Auto-Save to Draft Table**

**Frontend:** `BudgetTab.js` - `saveDraft()` function (line 1287)
```javascript
// Triggered every 30 seconds
useEffect(() => {
  const interval = setInterval(() => {
    if (Object.keys(htmlBudgetData).length > 0) {
      saveDraft();
    }
  }, 30000); // 30 seconds
  return () => clearInterval(interval);
}, [htmlBudgetData]);

const saveDraft = async () => {
  await axios.post('http://localhost:3001/api/budget-draft/save-draft', {
    division: selectedDivision,
    salesRep: htmlFilters.salesRep,
    budgetYear: parseInt(htmlFilters.actualYear) + 1,
    customRows: htmlCustomRows,
    budgetData: htmlBudgetData
  });
};
```

**Backend:** `server/routes/budget-draft.js` - `/save-draft` (line 14)
```javascript
router.post('/save-draft', async (req, res) => {
  // 1. Delete existing draft
  await client.query(`
    DELETE FROM sales_rep_budget_draft
    WHERE division = $1 AND salesrepname = $2 AND budget_year = $3
  `, [division, salesRep, budgetYear]);
  
  // 2. Insert new draft data (ONLY KGS values)
  for (const [key, value] of Object.entries(budgetData)) {
    const kgsValue = parseFloat(value) * 1000; // MT to KGS
    
    await client.query(`
      INSERT INTO sales_rep_budget_draft (
        division, budget_year, month, salesrepname,
        customername, countryname, productgroup, values, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')
    `, [division, budgetYear, month, salesRep, customer, country, productGroup, kgsValue]);
  }
});
```

**Database:** `sales_rep_budget_draft` table
- Stores work-in-progress budget
- Only KGS values (no Amount/MoRM yet)
- Status: 'DRAFT'

---

#### **Step 2: Submit Final Budget**

**Frontend:** `BudgetTab.js` - `submitFinalBudget()` function (line 1327)
```javascript
const submitFinalBudget = async () => {
  Modal.confirm({
    title: '⚠️ Confirm Final Budget Submission',
    content: 'This will finalize your budget and calculate Amount and MoRM values...',
    onOk: async () => {
      const response = await axios.post('http://localhost:3001/api/budget-draft/submit-final', {
        division: selectedDivision,
        salesRep: htmlFilters.salesRep,
        budgetYear: parseInt(htmlFilters.actualYear) + 1
      });
      
      // Show success with record counts
      Modal.success({
        title: '✅ Budget Submitted Successfully',
        content: (
          <div>
            <p>Records inserted:</p>
            <ul>
              <li>KGS: {response.data.recordsInserted.kgs}</li>
              <li>Amount: {response.data.recordsInserted.amount}</li>
              <li>MoRM: {response.data.recordsInserted.morm}</li>
              <li>Total: {response.data.recordsInserted.total}</li>
            </ul>
          </div>
        )
      });
    }
  });
};
```

**Backend:** `server/routes/budget-draft.js` - `/submit-final` (line 143)
```javascript
router.post('/submit-final', async (req, res) => {
  // 1. Fetch material/process data
  const materialProcessResult = await client.query(`
    SELECT product_group, material, process 
    FROM ${divisionCode}_material_percentages
  `);
  
  // 2. Fetch pricing data (previous year)
  const pricingYear = budgetYear - 1;
  const pricingResult = await client.query(`
    SELECT product_group, asp_round, morm_round
    FROM product_group_pricing_rounded
    WHERE division = $1 AND year = $2
  `, [divisionCode, pricingYear]);
  
  // 3. Get draft data
  const draftResult = await client.query(`
    SELECT * FROM sales_rep_budget_draft
    WHERE division = $1 AND salesrepname = $2 AND budget_year = $3
  `, [division, salesRep, budgetYear]);
  
  // 4. Delete existing final budget
  await client.query(`
    DELETE FROM sales_rep_budget
    WHERE division = $1 AND salesrepname = $2 AND budget_year = $3
  `, [division, salesRep, budgetYear]);
  
  // 5. Insert final budget (3 records per entry)
  for (const draftRow of draftResult.rows) {
    const kgsValue = draftRow.values;
    const pricing = pricingMap[productGroup];
    
    // Insert KGS record
    await client.query(`INSERT INTO sales_rep_budget (...) VALUES (..., 'KGS', $kgsValue, ...)`);
    
    // Insert Amount record (if pricing available)
    if (pricing.sellingPrice) {
      await client.query(`INSERT INTO sales_rep_budget (...) VALUES (..., 'Amount', $kgsValue * $sellingPrice, ...)`);
    }
    
    // Insert MoRM record (if pricing available)
    if (pricing.morm) {
      await client.query(`INSERT INTO sales_rep_budget (...) VALUES (..., 'MoRM', $kgsValue * $morm, ...)`);
    }
  }
  
  // 6. Return success with counts
  res.json({
    success: true,
    recordsInserted: { kgs, amount, morm, total },
    pricingYear
  });
});
```

**Database:** `sales_rep_budget` table
- Final budget storage
- 3 records per entry: KGS, Amount, MoRM
- Type: 'Budget'

---

## 🟢 METHOD 2: HTML IMPORT (Export → Fill → Import)

### **User Flow:**

```
1. User opens Budget Tab (HTML Format)
2. Selects filters: Division, Actual Year, Sales Rep
3. Clicks "Export HTML Form"
4. HTML file downloads with actual data pre-filled
5. User opens HTML in browser (offline)
6. Fills budget values
7. Clicks "Save Final" → New HTML file downloads
8. User returns to Budget Tab
9. Clicks "Import Filled HTML" (no filters needed!)
10. Selects the saved HTML file
11. System imports and saves to sales_rep_budget table
```

### **Technical Flow:**

#### **Step 1: Export HTML Form**

**Frontend:** `BudgetTab.js` - `handleExportHtmlForm()` (line 1436)
```javascript
const handleExportHtmlForm = async () => {
  const response = await axios.post('http://localhost:3001/api/aebf/export-html-budget-form', {
    division: selectedDivision,
    actualYear: htmlFilters.actualYear,
    salesRep: htmlFilters.salesRep,
    tableData: htmlTableData,
    customRowsData: customRowsData,
    budgetData: htmlBudgetData,
    mergedCustomers: htmlMergedCustomers,
    countries: htmlCountries,
    productGroups: htmlProductGroups
  });
  
  // Download HTML file
  const blob = new Blob([response.data], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Budget_${division}_${salesRep}_${actualYear}.html`;
  a.click();
};
```

**Backend:** `server/routes/aebf.js` - `/export-html-budget-form` (line 2257)
```javascript
router.post('/export-html-budget-form', async (req, res) => {
  // Generate complete HTML file with:
  // - Actual data (read-only, blue rows)
  // - Empty budget input fields (yellow rows)
  // - JavaScript for interactivity
  // - Save Draft button
  // - Save Final button
  
  const html = `<!DOCTYPE html>
  <html>
    <head>...</head>
    <body>
      <table>
        <!-- Actual data rows (blue) -->
        <!-- Budget input rows (yellow) -->
      </table>
      
      <script>
        // Save Draft function
        document.getElementById('saveDraftBtn').addEventListener('click', function() {
          // Clone document, keep editable
          // Add draftMetadata with isDraft: true
          // Download as DRAFT_*.html
        });
        
        // Save Final function
        document.getElementById('saveFinalBtn').addEventListener('click', function() {
          // Collect all budget values
          const budgetData = [];
          document.querySelectorAll('input[data-month]').forEach(input => {
            budgetData.push({
              customer: input.dataset.customer,
              country: input.dataset.country,
              productGroup: input.dataset.group,
              month: parseInt(input.dataset.month),
              value: parseFloat(input.value) * 1000  // MT to KGS
            });
          });
          
          // Add metadata
          const metadata = {
            division: formData.division,
            salesRep: formData.salesRep,
            budgetYear: formData.budgetYear,
            savedAt: new Date().toISOString(),
            version: '1.0',
            dataFormat: 'budget_import'
          };
          
          // Embed as JavaScript
          const script = document.createElement('script');
          script.textContent = 
            'const budgetMetadata = ' + JSON.stringify(metadata) + ';\\n' +
            'const savedBudget = ' + JSON.stringify(budgetData) + ';';
          
          // Download as BUDGET_*.html
          const filename = 'BUDGET_' + division + '_' + salesRep + '_' + budgetYear + '_' + timestamp + '.html';
          download(filename);
        });
      </script>
    </body>
  </html>`;
  
  res.send(html);
});
```

---

#### **Step 2: User Fills Budget (Offline)**

User works in browser with the HTML file:
- Enters values in MT
- Can save draft (DRAFT_*.html) to continue later
- Clicks "Save Final" when complete
- New file downloads: `BUDGET_Division_SalesRep_Year_Timestamp.html`

**Embedded Data Structure:**
```javascript
const budgetMetadata = {
  division: "FP",
  salesRep: "Narek Koroukian",
  actualYear: 2025,
  budgetYear: 2026,
  savedAt: "2025-11-22T10:01:56.186Z",
  version: "1.0",
  dataFormat: "budget_import"
};

const savedBudget = [
  {
    customer: "Customer A",
    country: "United Arab Emirates",
    productGroup: "Flexible Packaging",
    month: 1,
    value: 5000  // Already in KGS (MT * 1000)
  },
  // ... more records
];
```

---

#### **Step 3: Import Filled HTML**

**Frontend:** `BudgetTab.js` - `handleImportFilledHtml()` (line 1018)
```javascript
const handleImportFilledHtml = async (file) => {
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    const htmlContent = e.target.result;
    
    // Validate filename
    const filenamePattern = /^BUDGET_(.+)_(\d{4})_(\d{8})_(\d{6})\.html$/;
    if (!file.name.match(filenamePattern)) {
      message.error('Invalid filename format');
      return;
    }
    
    // Extract metadata from HTML content
    const metadataMatch = htmlContent.match(/const budgetMetadata = ({[^;]+});/);
    const metadata = JSON.parse(metadataMatch[1]);
    
    // Send to backend
    message.loading('Uploading and processing budget...');
    
    const response = await axios.post('http://localhost:3001/api/aebf/import-budget-html', {
      htmlContent
    });
    
    // Show success modal
    Modal.success({
      title: '✅ Budget Data Imported Successfully',
      content: (
        <div>
          <p>Division: {response.data.metadata.division}</p>
          <p>Sales Rep: {response.data.metadata.salesRep}</p>
          <p>Budget Year: {response.data.metadata.budgetYear}</p>
          <p>Records Inserted:</p>
          <ul>
            <li>KGS: {response.data.recordsInserted.kgs}</li>
            <li>Amount: {response.data.recordsInserted.amount}</li>
            <li>MoRM: {response.data.recordsInserted.morm}</li>
            <li>Total: {response.data.recordsInserted.total}</li>
          </ul>
        </div>
      )
    });
  };
  
  reader.readAsText(file);
};
```

**Backend:** `server/routes/aebf.js` - `/import-budget-html` (line 3390)
```javascript
router.post('/import-budget-html', async (req, res) => {
  // 1. Extract data from HTML
  const metadataMatch = htmlContent.match(/const budgetMetadata = ({[^;]+});/);
  const budgetDataMatch = htmlContent.match(/const savedBudget = (\[[^\]]+\]);/s);
  
  const metadata = JSON.parse(metadataMatch[1]);
  const budgetData = JSON.parse(budgetDataMatch[1]);
  
  // 2. Check for draft file (reject)
  const draftCheck = htmlContent.match(/const draftMetadata = ({[^;]+});/);
  if (draftCheck && draftCheck.isDraft === true) {
    return res.status(400).json({ error: 'Cannot upload draft file!' });
  }
  
  // 3. Fetch material/process data
  const materialProcessResult = await client.query(`
    SELECT product_group, material, process 
    FROM ${divisionCode}_material_percentages
  `);
  
  // 4. Fetch pricing data (previous year)
  const pricingYear = metadata.budgetYear - 1;
  const pricingResult = await client.query(`
    SELECT product_group, asp_round, morm_round
    FROM product_group_pricing_rounded
    WHERE division = $1 AND year = $2
  `, [divisionCode, pricingYear]);
  
  // 5. Delete existing budget
  await client.query(`
    DELETE FROM sales_rep_budget
    WHERE division = $1 AND salesrepname = $2 AND budget_year = $3
  `, [metadata.division, metadata.salesRep, metadata.budgetYear]);
  
  // 6. Insert new budget (3 records per entry)
  for (const record of budgetData) {
    const kgsValue = record.value; // Already in KGS
    const pricing = pricingMap[record.productGroup];
    
    // Insert KGS record
    await client.query(`INSERT INTO sales_rep_budget (...) VALUES (..., 'KGS', $kgsValue, ...)`);
    
    // Insert Amount record (if pricing available)
    if (pricing.sellingPrice) {
      await client.query(`INSERT INTO sales_rep_budget (...) VALUES (..., 'Amount', $kgsValue * $sellingPrice, ...)`);
    }
    
    // Insert MoRM record (if pricing available)
    if (pricing.morm) {
      await client.query(`INSERT INTO sales_rep_budget (...) VALUES (..., 'MoRM', $kgsValue * $morm, ...)`);
    }
  }
  
  // 7. Return success
  res.json({
    success: true,
    metadata,
    recordsInserted: { kgs, amount, morm, total },
    pricingYear
  });
});
```

---

## 📊 COMPARISON TABLE

| Feature | METHOD 1: Live Entry | METHOD 2: HTML Import |
|---------|---------------------|---------------------|
| **User Location** | Online (React app) | Offline (Browser) |
| **Auto-save** | ✅ Every 30 seconds | ❌ Manual save |
| **Draft Storage** | `sales_rep_budget_draft` table | DRAFT_*.html file |
| **Final Storage** | `sales_rep_budget` table | `sales_rep_budget` table |
| **Requires Filters** | ✅ Yes (before entry) | ❌ No (data in file) |
| **Unit Conversion** | MT → KGS (× 1000) | MT → KGS (× 1000) |
| **Calculations** | On "Submit Final" | On Import |
| **Material/Process** | From material_percentages | From material_percentages |
| **Pricing Lookup** | Year = budgetYear - 1 | Year = budgetYear - 1 |
| **Records Created** | KGS + Amount + MoRM | KGS + Amount + MoRM |
| **Can Edit After** | ✅ Yes (if not locked) | ✅ Yes (re-import) |
| **Workflow** | Draft → Final | Export → Fill → Import |

---

## 🐛 BUGS FOUND & ANALYSIS

### ⚠️ **BUG #1: Live Entry Only Saves Custom Rows**

**Location:** `server/routes/budget-draft.js` line 54-64

**Code:**
```javascript
if (key.startsWith('custom_')) {
  // Process custom row
  const rowId = parts[1];
  const row = customRows?.find(r => r.id.toString() === rowId);
  customer = row.customer;
  country = row.country;
  productGroup = row.productGroup;
} else {
  // This is from existing table data - skip for now
  continue;  // ❌ BUG: Skips existing customer rows!
}
```

**Problem:**
- Live entry ONLY saves budget values for NEW custom rows
- Budget values entered for EXISTING customers (from actual data) are IGNORED
- This means users can't enter budget for customers who had sales last year!

**Impact:** HIGH - Users can only budget for NEW customers, not existing ones

**Fix Needed:**
```javascript
} else {
  // Parse existing table row data
  const parts = key.split('|');
  if (parts.length === 4) {
    customer = parts[0];
    country = parts[1];
    productGroup = parts[2];
    month = parseInt(parts[3]);
  } else {
    continue;
  }
}
```

---

### ⚠️ **BUG #2: Inconsistent Key Formats**

**Location:** Multiple files

**Problem:**
- Live Entry uses: `custom_rowId_month` or `rowIndex_month`
- HTML Import uses: `customer|country|productGroup|month`
- Display loading uses: `customer|country|productGroup|month`

**Impact:** MEDIUM - Confusing and error-prone

**Example:**
```javascript
// Live Entry (BudgetTab.js)
const key = `custom_${row.id}_${month}`;
htmlBudgetData[key] = value;

// HTML Import (aebf.js)
const key = `${customer}|${country}|${productGroup}|${month}`;
budgetMap[key] = value;

// Display (BudgetTab.js)
const key = `${row.customer}|${row.country}|${row.productGroup}|${month}`;
const value = htmlBudgetData[key];
```

**Fix Needed:** Standardize to one format across all methods

---

### ⚠️ **BUG #3: Missing Unique Constraint in sales_rep_budget**

**Location:** `server/routes/aebf.js` line 3618

**Code:**
```javascript
INSERT INTO sales_rep_budget (...)
VALUES (...)
ON CONFLICT (division, budget_year, month, type, salesrepname, customername, countryname, productgroup, values_type)
DO UPDATE SET values = EXCLUDED.values, ...
```

**Problem:**
- Uses ON CONFLICT but the unique constraint might not exist in the table
- If constraint doesn't exist, duplicate records can be inserted

**Impact:** MEDIUM - Could create duplicate records

**Fix Needed:** Ensure unique constraint exists:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_rep_budget_unique 
ON sales_rep_budget (division, budget_year, month, type, salesrepname, customername, countryname, productgroup, values_type);
```

---

### ✅ **NOT A BUG: Different Draft Tables**

**Observation:**
- Live Entry uses: `sales_rep_budget_draft`
- HTML method has no draft table (uses DRAFT_*.html files)

**Analysis:** This is by design, not a bug
- Live method needs server-side draft storage
- HTML method uses client-side file storage
- Both are valid approaches

---

### ⚠️ **BUG #4: No Validation for Negative Values**

**Location:** Both methods

**Problem:**
- No validation to prevent negative budget values
- User could enter `-100` and it would be accepted

**Impact:** LOW - Data quality issue

**Fix Needed:** Add validation:
```javascript
if (value <= 0) {
  message.error('Budget values must be positive');
  return;
}
```

---

### ⚠️ **BUG #5: Missing Error Handling for Missing Pricing Data**

**Location:** Both methods

**Problem:**
- If pricing data doesn't exist for (budgetYear - 1), Amount/MoRM records are skipped
- No warning shown to user
- User might not realize data is incomplete

**Impact:** MEDIUM - Silent data loss

**Fix Needed:** Add warning:
```javascript
if (insertedAmount === 0 || insertedMoRM === 0) {
  console.warn(`⚠️ Missing pricing data for year ${pricingYear}`);
  // Add to response
  warnings.push(`Some Amount/MoRM records skipped due to missing pricing data for ${pricingYear}`);
}
```

---

## 🎯 RECOMMENDATIONS

### **Priority 1: Fix Bug #1 (Live Entry Only Saves Custom Rows)**
This is critical - users can't budget for existing customers!

### **Priority 2: Standardize Key Formats (Bug #2)**
Use `customer|country|productGroup|month` everywhere

### **Priority 3: Add Pricing Data Warnings (Bug #5)**
Users need to know when calculations are incomplete

### **Priority 4: Add Unique Constraint (Bug #3)**
Prevent duplicate records

### **Priority 5: Add Value Validation (Bug #4)**
Prevent negative/invalid values

---

## ✅ SUMMARY

Both methods work and end up in the same place (`sales_rep_budget` table), but:

1. **Live Entry** is better for:
   - Users who want auto-save
   - Users who want to work online
   - Quick edits

2. **HTML Import** is better for:
   - Users who want to work offline
   - Bulk data entry
   - Sharing budget files

**Critical Issue:** Live Entry currently only saves NEW customer rows, not existing ones. This needs to be fixed immediately!

---

## 📝 FINAL DATA FLOW

Both methods converge to the same final state:

```
┌─────────────────────────────────────────────────────┐
│  sales_rep_budget TABLE                             │
├─────────────────────────────────────────────────────┤
│  division | budget_year | salesrepname | values_type│
│  FP       | 2026        | Narek K.     | KGS        │
│  FP       | 2026        | Narek K.     | Amount     │
│  FP       | 2026        | Narek K.     | MoRM       │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  DISPLAY IN BUDGET TAB                              │
├─────────────────────────────────────────────────────┤
│  User selects filters → Table shows budget values   │
│  (Now working after our fix!)                       │
└─────────────────────────────────────────────────────┘
```

**Both methods work, but Bug #1 needs immediate attention!** 🚨


















