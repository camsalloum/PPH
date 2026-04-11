# Multi-Database Architecture Conversion - COMPLETE

## Overview
All application code has been converted to use division-specific databases and tables. This document summarizes the changes made.

## Architecture
- **Shared Database**: `ip_auth_database` - Authentication only
- **Division Databases**: Each division has its own database
  - `fp_database` - FP division
  - `pp_database` - PP division
  - `sb_database` - SB division
  - `tf_database` - TF division
  - `hcm_database` - HCM division

## Table Naming Convention
All tables are prefixed with the division code:
- `{code}_data_excel` - Main data table
- `{code}_material_percentages` - Material/process mapping
- `{code}_product_group_pricing_rounding` - Pricing data
- `{code}_sales_rep_budget` - Sales rep budgets
- `{code}_sales_rep_budget_draft` - Budget drafts
- `{code}_divisional_budget` - Divisional budgets
- `{code}_divisional_budget_archive` - Budget archives
- `{code}_customer_merge_rules` - Customer merge rules (per sales rep)
- `{code}_division_customer_merge_rules` - Division-wide merge rules
- `{code}_merge_rule_suggestions` - AI merge suggestions
- `{code}_merge_rule_notifications` - Merge notifications
- `{code}_database_upload_log` - Upload logs
- `{code}_customer_similarity_cache` - Similarity cache

## Files Updated

### Routes
| File | Status | Changes |
|------|--------|---------|
| `server/routes/aebf.js` | ✅ Complete | Added `extractDivisionCode()`, `getPoolForDivision()`, `getTableNames()` helpers. All queries use `divisionPool` and `${tables.tableName}` |
| `server/routes/budget-draft.js` | ✅ Complete | Added division helpers. All endpoints use division-specific pools and tables |
| `server/routes/divisionMergeRules.js` | ✅ Complete | Added division helpers. All CRUD operations use division-specific resources |

### Services
| File | Status | Changes |
|------|--------|---------|
| `server/services/salesRepBudgetService.js` | ✅ Complete | Uses `getTableNames()` for all table references |
| `server/services/divisionalBudgetService.js` | ✅ Complete | Added `getPricingRoundingTable()`, uses dynamic table names |
| `server/services/CustomerMergingAI.js` | ✅ Complete | Added `getTableNames()`, all DB operations division-aware |

### Database Services
| File | Status | Changes |
|------|--------|---------|
| `server/database/CustomerMergeRulesService.js` | ✅ Complete | Added `extractDivisionCode()`, `getTableNames()`, `getPoolForDivision()` |
| `server/database/DivisionMergeRulesService.js` | ✅ Complete | Uses division-specific pools and tables |
| `server/database/ProductPricingRoundingService.js` | ✅ Complete | Table creation and queries per division |
| `server/database/CustomerInsightsService.js` | ✅ Complete | Uses division-specific pools for all queries |

### Core Server
| File | Status | Changes |
|------|--------|---------|
| `server/server.js` | ✅ Complete | Added `getDivisionPool` import, merge rules query uses division pool |

## Helper Functions Pattern
Each file that needs division-specific resources includes these helpers:

```javascript
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

function extractDivisionCode(division) {
  if (!division) return 'fp';
  return division.split('-')[0].toLowerCase();
}

function getPoolForDivision(division) {
  const divisionCode = extractDivisionCode(division);
  return getDivisionPool(divisionCode.toUpperCase());
}

function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    dataExcel: `${code}_data_excel`,
    salesRepBudget: `${code}_sales_rep_budget`,
    // ... other tables
  };
}
```

## Not Updated (Intentionally)
- `server/scripts/` - Utility/migration scripts (not runtime)
- `server/services/Enhencemnts/` - Backup/enhancement files (not active)
- `server/check-*.js` - Debug check scripts (not runtime)

## Usage Example
```javascript
// Before (shared pool, hardcoded tables)
const result = await pool.query('SELECT * FROM sales_rep_budget WHERE division = $1', [division]);

// After (division-specific pool, dynamic tables)
const divisionPool = getPoolForDivision(division);
const tables = getTableNames(division);
const result = await divisionPool.query(`SELECT * FROM ${tables.salesRepBudget} WHERE division = $1`, [division]);
```

## Testing Checklist
- [ ] FP division data isolation
- [ ] PP division data isolation
- [ ] Budget operations (save, load, delete)
- [ ] Merge rules CRUD
- [ ] AI suggestions
- [ ] Customer insights
- [ ] Pricing data operations

## Date
Conversion completed: Session in progress
