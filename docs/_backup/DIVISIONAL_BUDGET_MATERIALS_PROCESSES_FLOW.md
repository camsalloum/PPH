# Divisional Budget: How Materials and Processes are Added to Database

## Overview

When a **divisional budget** is submitted (either live from the web interface or imported from an HTML file), materials and processes are **automatically added** to the database by looking them up from a master data table. They are **NOT manually entered** during budget submission.

---

## Two Methods of Submitting Divisional Budget

### 1. **Live Submission** (Direct from Web Interface)
- **Endpoint**: `POST /api/aebf/save-divisional-budget`
- **Location**: `server/routes/aebf.js` (lines 6868-6915)
- **Service Function**: `saveDivisionalBudget()` in `server/services/divisionalBudgetService.js`
- **Trigger**: User clicks "Submit" button in the web app's divisional budget form

### 2. **HTML Import** (Upload filled HTML file)
- **Endpoint**: `POST /api/aebf/import-divisional-budget-html`
- **Location**: `server/routes/aebf.js` (lines 6582-6862)
- **Service Function**: `saveDivisionalBudget()` in `server/services/divisionalBudgetService.js` (same as above)
- **Trigger**: User uploads a filled HTML file that was exported earlier

---

## How Materials and Processes are Added

### Step 1: Lookup Material/Process Mapping

Both methods use the same service function `saveDivisionalBudget()`, which calls `fetchMaterialProcessMap()`:

```157:180:server/services/divisionalBudgetService.js
const fetchMaterialProcessMap = async (client, divisionCode) => {
  if (!divisionCode) {
    return {};
  }

  const tableName = `${divisionCode}_material_percentages`;
  try {
    const result = await client.query(`
      SELECT product_group, material, process
      FROM ${tableName}
    `);

    return result.rows.reduce((map, row) => {
      map[normalizeProductGroupKey(row.product_group)] = {
        material: row.material || '',
        process: row.process || ''
      };
      return map;
    }, {});
  } catch (error) {
    console.warn(`⚠️ Material percentages lookup failed for table ${tableName}:`, error.message);
    return {};
  }
};
```

**Key Points:**
- Materials and processes are **looked up** from the `{division}_material_percentages` table
- The lookup is based on **product group** (case-insensitive)
- Example: For division "FP-UAE", it queries from `fp_material_percentages` table
- Creates a map like: `{ "flexible packaging": { material: "LDPE", process: "Extrusion" } }`

### Step 2: Apply to Budget Records

During budget insertion, the material and process are applied to each record:

```267:321:server/services/divisionalBudgetService.js
  for (const record of validRecords) {
    const productGroupKey = normalizeProductGroupKey(record.productGroup);
    const materialProcess = materialProcessMap[productGroupKey] || { material: '', process: '' };
    const pricing = pricingMap[productGroupKey] || { sellingPrice: null, morm: null };

    // 1. KGS Record (Always add)
    rowsToUpsert.push([
      division.toUpperCase(),
      budgetYear,
      record.month,
      record.productGroup,
      'KGS',
      record.value,
      materialProcess.material,
      materialProcess.process,
      uploadedFilename,
      new Date().toISOString() // uploaded_at
    ]);

    // 2. Amount Record (If pricing available)
    if (pricing.sellingPrice !== null) {
      rowsToUpsert.push([
        division.toUpperCase(),
        budgetYear,
        record.month,
        record.productGroup,
        'Amount',
        record.value * pricing.sellingPrice,
        materialProcess.material,
        materialProcess.process,
        uploadedFilename,
        new Date().toISOString() // uploaded_at
      ]);
    } else {
      missingPricingProducts.add(record.productGroup);
    }

    // 3. MoRM Record (If pricing available)
    if (pricing.morm !== null) {
      rowsToUpsert.push([
        division.toUpperCase(),
        budgetYear,
        record.month,
        record.productGroup,
        'MoRM',
        record.value * pricing.morm,
        materialProcess.material,
        materialProcess.process,
        uploadedFilename,
        new Date().toISOString() // uploaded_at
      ]);
    } else {
      missingPricingProducts.add(record.productGroup);
    }
  }
```

**Key Points:**
- For each budget entry, 3 records are created: **KGS**, **Amount**, and **MoRM**
- **Material and process are added to ALL 3 records** for the same product group
- If product group is not found in the material_percentages table, empty strings are used
- The material/process values are inserted directly into the divisional budget table columns

### Step 3: Database Insert

The records are inserted into the divisional budget table:

```346:357:server/services/divisionalBudgetService.js
      const upsertQuery = `
        INSERT INTO public.${budgetTable} (
          division, year, month, product_group, metric, value, material, process, uploaded_filename, uploaded_at
        ) VALUES ${placeholders}
        ON CONFLICT (UPPER(division), year, month, product_group, UPPER(metric))
        DO UPDATE SET
          value = EXCLUDED.value,
          material = EXCLUDED.material,
          process = EXCLUDED.process,
          uploaded_filename = EXCLUDED.uploaded_filename,
          uploaded_at = CURRENT_TIMESTAMP
      `;
```

**Key Points:**
- Table name format: `{division}_divisional_budget` (e.g., `fp_divisional_budget`)
- Material and process are stored as **columns** in the budget table
- Uses `ON CONFLICT UPDATE` to update existing records with new material/process values

---

## Summary: Where Materials and Processes Come From

| Source | Description |
|--------|-------------|
| **Master Data Table** | `{division}_material_percentages` table (e.g., `fp_material_percentages`) |
| **Lookup Key** | Product Group (case-insensitive, normalized to lowercase) |
| **Lookup Function** | `fetchMaterialProcessMap()` in `server/services/divisionalBudgetService.js` |
| **Applied To** | All 3 budget records (KGS, Amount, MoRM) for each product group/month |
| **Storage Table** | `{division}_divisional_budget` table |

---

## Important Notes

1. **Materials and processes are NOT entered manually** during budget submission
2. They are **automatically looked up** from the material percentages master data table
3. The lookup happens **during the save process**, not at data entry time
4. If a product group doesn't exist in the material_percentages table:
   - Empty strings (`''`) are used for material and process
   - A warning is logged but the budget record is still inserted
5. **Same logic applies** for both:
   - Live submission from web interface
   - HTML file import

---

## Related Files

- **Service Logic**: `server/services/divisionalBudgetService.js`
  - `fetchMaterialProcessMap()` - Line 157-180 (lookup function)
  - `saveDivisionalBudget()` - Line 215-393 (main save function)
  
- **API Endpoints**: `server/routes/aebf.js`
  - `POST /api/aebf/save-divisional-budget` - Line 6868-6915 (live submission)
  - `POST /api/aebf/import-divisional-budget-html` - Line 6582-6862 (HTML import)

- **Frontend**: `src/components/MasterData/AEBF/BudgetTab.js`
  - `submitDivisionalBudget()` - Line 2748-2833 (live submit handler)
  - `handleImportDivisionalFilledHtml()` - Line 2379-2605 (HTML import handler)








