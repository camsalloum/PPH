# Confirmation: Material & Process Automatic Lookup for Sales Rep Budgets

## ✅ CONFIRMED: Both Methods Automatically Lookup Materials and Processes

Users do **NOT** need to manually enter materials and processes. The system automatically looks them up from the master data table based on **product group** during database insertion.

---

## Method 1: Live Submission (Web Interface)

### Endpoint: `POST /api/aebf/save-html-budget`
### Service: `saveLiveSalesRepBudget()` in `server/services/salesRepBudgetService.js`

### Process Flow:

1. **User enters data** in web interface:
   - Customer, Country, Product Group, Month, Value (KGS)
   - ❌ User does **NOT** enter material or process

2. **Backend receives data** and calls `saveLiveSalesRepBudget()`:
   ```javascript
   // Line 268: Fetch material/process map from master data table
   const materialProcessMap = await fetchMaterialProcessMap(client, divisionCode);
   
   // Line 269: Fetch pricing map for calculations
   const pricingMap = await fetchPricingMap(client, metadata.division, divisionCode, pricingYear);
   ```

3. **Lookup happens automatically** for each record:
   ```javascript
   // Line 304: Normalize product group key
   const productGroupKey = normalizeProductGroupKey(record.productGroup);
   
   // Line 305: Lookup material/process from map (by product group only)
   const materialProcess = materialProcessMap[productGroupKey] || { material: '', process: '' };
   ```

4. **Database insertion** with auto-filled values:
   ```javascript
   // Lines 318-319: Material and process inserted automatically
   await insertRecord(client, insertQuery, [
     // ... other fields ...
     materialProcess.material,    // ✅ Auto-filled from lookup
     materialProcess.process,      // ✅ Auto-filled from lookup
     // ...
   ]);
   ```

### Code Location:
- **Service Function**: `server/services/salesRepBudgetService.js` (lines 220-389)
- **Lookup Function**: `fetchMaterialProcessMap()` (lines 161-184)
- **Endpoint**: `server/routes/aebf.js` (lines 2597-2643)

---

## Method 2: HTML Import (Upload Filled HTML File)

### Endpoint: `POST /api/aebf/import-budget-html`
### Service: Uses same lookup functions as Method 1

### Process Flow:

1. **User exports HTML**, fills it offline, then uploads:
   - HTML contains: Customer, Country, Product Group, Month, Value (KGS)
   - ❌ HTML does **NOT** contain material or process fields

2. **Backend parses HTML** and extracts budget data:
   ```javascript
   // Line 5011: Fetch material/process map from master data table
   const materialProcessMap = await fetchMaterialProcessMap(client, divisionCode);
   
   // Line 5012: Fetch pricing map for calculations
   const pricingMap = await fetchPricingMap(client, metadata.division, divisionCode, pricingYear);
   ```

3. **Lookup happens automatically** for each imported record:
   ```javascript
   // Line 5222: Normalize product group key
   const productGroupKey = normalizeProductGroupKey(record.productGroup);
   
   // Line 5223: Lookup material/process from map (by product group only)
   const materialProcess = materialProcessMap[productGroupKey] || { material: '', process: '' };
   ```

4. **Database insertion** with auto-filled values:
   ```javascript
   // Lines 5190-5191, 5230-5231, 5251-5252: Material and process inserted for all 3 record types
   await client.query(insertQuery, [
     // ... other fields ...
     materialProcess.material,    // ✅ Auto-filled from lookup
     materialProcess.process,      // ✅ Auto-filled from lookup
     // ...
   ]);
   ```

### Code Location:
- **Endpoint**: `server/routes/aebf.js` (lines 4712-5321)
- **Uses same lookup functions**: `fetchMaterialProcessMap()` and `fetchPricingMap()`

---

## Key Points

### ✅ Automatic Lookup Confirmed

1. **Lookup Source**: `{division}_material_percentages` table (e.g., `fp_material_percentages`)
   - Query: `SELECT product_group, material, process FROM {division}_material_percentages`
   - Creates map: `{ "product group name": { material: "...", process: "..." } }`

2. **Lookup Key**: **Product Group Only**
   - Customer and Country do **NOT** affect the lookup
   - Same product group = same material/process, regardless of customer/country
   - Case-insensitive matching (normalized to lowercase)

3. **Applied Automatically**:
   - All 3 record types get the same material/process: KGS, Amount, MoRM
   - Inserted into database columns during save/import
   - User never sees or enters these values

4. **Fallback Behavior**:
   - If product group not found in master data: `material: ''`, `process: ''` (empty strings)
   - Record still inserted (no error)
   - Warning logged if pricing data missing

---

## Verification Steps

### Check Live Submission:
1. Open browser developer console
2. Submit a budget via web interface
3. Check network request to `/api/aebf/save-html-budget`
4. Verify response includes material/process values
5. Check database: `SELECT material, process FROM fp_sales_rep_budget WHERE ...`
   - ✅ Should show populated values (not empty unless product group missing from master data)

### Check HTML Import:
1. Export HTML budget form
2. Fill in customer, country, product group, values
3. Import the HTML file
4. Check server logs for:
   - `📋 Material/Process lookup map: { ... }`
   - Should show mapping of product groups to materials/processes
5. Check database: `SELECT material, process FROM fp_sales_rep_budget WHERE ...`
   - ✅ Should show populated values

---

## Example: Material/Process Lookup

### Master Data Table (`fp_material_percentages`):
```
product_group          | material | process
-----------------------|----------|-------------
flexible packaging     | PE       | Printed
rigid packaging        | HDPE     | Injection Molding
shrink film plain      | PE       | Unprinted
```

### Budget Record (User Entered):
```
customer: "ABC Company"
country: "UAE"
product_group: "flexible packaging"  ← This triggers lookup
month: 1
value: 5000 (KGS)
```

### Database Insertion (Automatic):
```sql
INSERT INTO fp_sales_rep_budget (
  customer, country, productgroup, material, process, values_type, values
) VALUES (
  'ABC Company', 
  'UAE', 
  'flexible packaging',
  'PE',           -- ✅ Auto-filled from lookup
  'Printed',      -- ✅ Auto-filled from lookup
  'KGS',
  5000
);
```

---

## Summary

✅ **CONFIRMED**: Both methods automatically lookup and populate materials and processes  
✅ **Source**: `{division}_material_percentages` master data table  
✅ **Lookup Key**: Product Group only (case-insensitive)  
✅ **Applied To**: All 3 record types (KGS, Amount, MoRM)  
✅ **User Input**: Users do NOT enter material/process - it's automatic  

The system is working as designed! Materials and processes are automatically filled from the master data table based on product group lookup during database insertion.








