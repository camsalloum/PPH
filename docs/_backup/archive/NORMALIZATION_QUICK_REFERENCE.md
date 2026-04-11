# 🎯 NORMALIZATION QUICK REFERENCE CARD
**Keep this handy when coding!**

---

## ⚡ QUICK IMPORTS

### Backend
```javascript
const { 
  findByNormalizedName, 
  norm, 
  validateYear,
  buildNormalizedWhereClause 
} = require('../utils/normalization');
```

### Frontend
```javascript
import { 
  findByNormalizedName, 
  norm, 
  areEqual 
} from '../utils/normalization';
```

---

## ✅ DO THIS (Safe Patterns)

### Finding Items
```javascript
// ✅ BEST - Use helper:
const customer = findByNormalizedName(customers, 'name', searchName);

// ✅ GOOD - Manual norm:
const customer = customers.find(c => norm(c.name) === norm(searchName));
```

### Comparing Strings
```javascript
// ✅ Use areEqual:
if (areEqual(name1, name2)) { /* ... */ }

// ✅ Or norm both sides:
if (norm(name1) === norm(name2)) { /* ... */ }
```

### SQL Queries
```javascript
// ✅ Use UPPER(TRIM()):
WHERE UPPER(TRIM(customer)) = UPPER($1)

// ✅ Or use builder:
WHERE ${buildNormalizedWhereClause('customer', 1)}
```

### Validating Input
```javascript
// ✅ Always validate:
const year = validateYear(req.params.year);
const month = validateMonth(req.params.month);
```

---

## ❌ DON'T DO THIS (Bugs!)

### Direct Comparison
```javascript
// ❌ Case-sensitive bug:
const customer = customers.find(c => c.name === searchName);

// ❌ Will break with "Mai Dubai" vs "mai dubai"
if (name1 === name2) { /* ... */ }
```

### Raw SQL
```javascript
// ❌ Not normalized:
WHERE customer = $1

// ❌ Inconsistent pattern:
WHERE LOWER(customer) = LOWER($1)
```

### No Validation
```javascript
// ❌ Can crash:
const year = req.params.year;
const query = `SELECT * FROM table_${year}`;
```

---

## 🎨 PATTERNS BY USE CASE

### Search/Filter
```javascript
// Input: user typed "mai dubai"
const results = filterByNormalizedName(customers, 'name', userInput);
```

### Dropdown Selection
```javascript
// User selected "MAI DUBAI"
const selected = findByNormalizedName(customers, 'name', selectedValue);
```

### API Response Matching
```javascript
// API returns "Mai Dubai", local has "MAI DUBAI"
const match = customers.find(c => norm(c.name) === norm(apiCustomer.name));
```

### SQL Query
```javascript
// Build WHERE clause
const query = `
  SELECT * FROM customers 
  WHERE ${buildNormalizedWhereClause('customer', 1)}
    AND ${buildNormalizedWhereClause('sales_rep', 2)}
`;
const result = await pool.query(query, [customerName, salesRepName]);
```

---

## 🚀 PERFORMANCE TIPS

### Many Lookups? Use Map
```javascript
import { createNormalizedMap, norm } from '../utils/normalization';

// Create once:
const customerMap = createNormalizedMap(customers, 'name');

// Use many times (fast O(1)):
const customer1 = customerMap.get(norm('Mai Dubai'));
const customer2 = customerMap.get(norm('COSMOPLAST'));
```

### Precompute Normalization
```javascript
// If processing large arrays:
const normalized = customers.map(c => ({
  ...c,
  _normalizedName: norm(c.name)
}));

// Then compare using pre-normalized:
const match = normalized.find(c => c._normalizedName === norm(searchName));
```

---

## 🎓 REMEMBER

1. **Always normalize BOTH sides** of comparison
2. **Use UPPER(TRIM()) in SQL**, not LOWER()
3. **Validate user input** (years, months, etc.)
4. **Import utilities** instead of writing inline
5. **Test with different cases**: "ABC", "abc", "Abc"

---

## 📱 QUICK HELP

```javascript
// Not sure which function to use?

// Comparing two strings:
areEqual(str1, str2)

// Finding in array:
findByNormalizedName(array, 'name', value)

// Filtering array:
filterByNormalizedName(array, 'name', value)

// SQL WHERE clause:
buildNormalizedWhereClause('column', paramIndex)

// Validate year:
validateYear(yearValue)
```

---

**Print this and keep it visible while coding!** 📌
