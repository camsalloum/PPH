# Name Standardization Guide

## Overview

This guide explains the name standardization system implemented to prevent duplicate entries with different casings in the database.

## Problem

The database was experiencing duplicate sales rep entries due to inconsistent casing:
- "Mouhcine Fellah" (144 records)
- "MOUHCINE FELLAH" (48 records)

This caused the same sales rep to appear twice in the UI, leading to confusion and data integrity issues.

## Solution

A two-part solution has been implemented:

### 1. Database Standardization (One-time fix)

A script was created to standardize all existing data in the database to Title Case format.

**File**: `standardize_sales_rep_names.js`

**What it does**:
- Standardizes all `salesrepname` entries to Title Case
- Standardizes all `customername` entries to Title Case
- Standardizes all `countryname` entries to Title Case
- Standardizes all `productgroup` entries to Title Case

**How to run**:
```bash
node standardize_sales_rep_names.js
```

**Results** (from initial run):
- ✅ Updated 48 sales rep records (MOUHCINE FELLAH → Mouhcine Fellah)
- ✅ Standardized 26,424 customer name records
- ✅ Standardized 29,397 country name records
- ✅ No duplicate case variations remain

### 2. Utility Functions (Prevention)

A utility module has been created to standardize names during data processing.

**File**: `server/utils/nameStandardization.js`

**Available Functions**:

```javascript
const {
  toTitleCase,
  standardizeSalesRepName,
  standardizeCustomerName,
  standardizeCountryName,
  standardizeProductGroupName,
  standardizeDataObject,
  standardizeDataArray
} = require('./utils/nameStandardization');

// Example usage:
const name = "JOHN DOE";
const standardized = standardizeSalesRepName(name);
// Result: "John Doe"

// Standardize a data object:
const data = {
  salesrepname: "MOUHCINE FELLAH",
  customername: "acme corporation",
  countryname: "UNITED ARAB EMIRATES",
  productgroup: "STRETCH FILMS"
};

const standardizedData = standardizeDataObject(data);
// Result: {
//   salesrepname: "Mouhcine Fellah",
//   customername: "Acme Corporation",
//   countryname: "United Arab Emirates",
//   productgroup: "Stretch Films"
// }
```

## How to Use in Your Code

### When Processing Excel Uploads

```javascript
const { standardizeDataArray } = require('./utils/nameStandardization');

// After parsing Excel data
const rawData = parseExcelFile(file);

// Standardize all names before inserting into database
const standardizedData = standardizeDataArray(rawData);

// Now insert standardizedData into database
await insertIntoDatabase(standardizedData);
```

### When Handling API Inputs

```javascript
const { standardizeSalesRepName, standardizeCustomerName } = require('./utils/nameStandardization');

app.post('/api/sales', (req, res) => {
  // Standardize names from user input
  const salesRep = standardizeSalesRepName(req.body.salesRep);
  const customer = standardizeCustomerName(req.body.customer);

  // Use standardized names in database query
  // ...
});
```

### When Querying Data

For maximum compatibility, use case-insensitive comparisons in SQL queries:

```sql
-- Good: Case-insensitive comparison
SELECT * FROM fp_data_excel
WHERE UPPER(TRIM(salesrepname)) = UPPER(TRIM($1))

-- Better: Use standardized input
-- (Pass standardized name from JavaScript before query)
const standardizedName = standardizeSalesRepName(inputName);
// Then use in query
```

## Best Practices

1. **Always standardize input data** before inserting into the database
2. **Use the utility functions** provided in `nameStandardization.js`
3. **Run the standardization script** if you notice duplicate entries
4. **Document any new upload endpoints** that process name data

## Future Enhancements

Consider adding:
1. Database triggers to automatically standardize names on INSERT/UPDATE
2. Validation middleware for Express routes
3. Frontend validation to show users the standardized version before submission
4. Unit tests for the standardization functions

## Troubleshooting

### Still seeing duplicates?

1. Run the standardization script again:
   ```bash
   node standardize_sales_rep_names.js
   ```

2. Check if new data was added without standardization:
   ```sql
   SELECT
     UPPER(salesrepname) as normalized_name,
     COUNT(DISTINCT salesrepname) as variation_count,
     array_agg(DISTINCT salesrepname) as variations
   FROM fp_data_excel
   GROUP BY UPPER(salesrepname)
   HAVING COUNT(DISTINCT salesrepname) > 1;
   ```

3. Review recent code changes to ensure standardization is being applied

### Questions?

Contact the development team or refer to this documentation.

## Change Log

**2025-01-XX** - Initial implementation
- Created standardization script
- Created utility functions
- Standardized existing database (48 sales rep records, 26K+ customer records, 29K+ country records)
- Documented usage
