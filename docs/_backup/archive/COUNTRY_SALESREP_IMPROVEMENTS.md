# Country Reference & Sales Rep System Improvements

## Summary

This document summarizes the comprehensive improvements made to the Country Reference and Sales Rep systems on December 24, 2025.

---

## Phase 1: Country Database Seeding ✅ COMPLETE

### Problem
- Database had only **107 countries** while JavaScript had **193 countries** hardcoded
- **87 countries** existed in JS but were MISSING from database
- Caused inconsistencies between frontend and backend data

### Solution
Created `scripts/seed-missing-countries.js` that:
1. First adds **56 missing currencies** to the `currencies` table (due to FK constraint)
2. Then adds **92 missing countries** to the `master_countries` table
3. Includes coordinates, region, and currency code for each country

### Results
- ✅ Database now has **199 countries** (was 107)
- ✅ Database now has **129 currencies** (was 73)
- ✅ All major world countries are now in the database

### Run Script
```bash
node scripts/seed-missing-countries.js
```

---

## Phase 2: Sales Rep Auto-Registration ✅ COMPLETE

### Problem
- When uploading actual/budget data, new sales rep names were NOT added to `sales_rep_master`
- Only fuzzy-check happened, but new names weren't registered
- `sales_rep_master` table had 51 records, but 0 aliases

### Solution
Created `server/services/salesRepAutoRegister.js` that:
1. Queries distinct salesrepname from uploaded data
2. Compares against existing master + aliases
3. Uses Levenshtein fuzzy matching (85% threshold) to avoid near-duplicates
4. Auto-inserts truly new names into `sales_rep_master`

### Integration Points
- **actual.js**: Calls `autoRegisterSalesReps()` after successful upload
- **budget.js**: Calls `autoRegisterSalesReps()` after successful upload

### Manual Sync Script
```bash
node scripts/sync-all-sales-reps.js
```

---

## Phase 3: Database-First Region Service ✅ COMPLETE

### Problem
- `getRegionForCountry()` in `CountryReference.js` only used **hardcoded** data
- **902 duplicate regional mappings** in JavaScript (case variations like "UGANDA" and "Uganda")
- Never queried database for region assignments

### Solution
Created `src/services/regionService.js` that:
1. Loads all regions from database into memory cache on app startup
2. Provides `getRegionSync()` for fast synchronous lookups during rendering
3. Provides `getRegionAsync()` for guaranteed fresh data
4. Falls back to hardcoded mappings if database unavailable

### Updated Components
1. **ExecutiveSummary.js** - Now imports from `regionService`
2. **ReactGlobe.js** - Now imports from `regionService`
3. **SalesCountryChart.js** - Now imports from `regionService`
4. **CurrencyContext.js** - Loads region cache on startup

### API
```javascript
import { getRegionForCountry } from '../../services/regionService';

// Sync lookup (uses cache)
const region = getRegionForCountry('United Arab Emirates'); // 'UAE'

// Async lookup (queries API if needed)
const region = await getRegionAsync('UAE'); // 'UAE'
```

---

## Phase 4: Sales Rep Alias Resolution ✅ COMPLETE

### Problem
- When aliases exist (e.g., "Mohamed Ali" and "Mohammed Ali"), data wasn't aggregated together
- Aggregation queries didn't join with `sales_rep_aliases` table

### Solution
Created `server/services/salesRepResolver.js` that:
1. Loads all aliases into memory cache at server startup
2. Provides `resolveToCanonical(name)` to get canonical form
3. Provides `buildResolutionSQL(column)` to generate CASE expression for SQL queries

### Integration
- Cache loaded automatically at server startup in `index.js`
- Queries can use `buildResolutionSQL('salesrepname')` for aggregation

### Usage Example
```javascript
const { buildResolutionSQL } = require('./services/salesRepResolver');

// In aggregation query:
const sql = `
  SELECT ${buildResolutionSQL('salesrepname')} as sales_rep,
         SUM(values) as total
  FROM fp_data_excel
  GROUP BY ${buildResolutionSQL('salesrepname')}
`;
```

---

## Files Created/Modified

### New Files
| File | Description |
|------|-------------|
| `scripts/seed-missing-countries.js` | Seeds 92 missing countries + 56 currencies |
| `scripts/sync-all-sales-reps.js` | Manual sync of all sales reps to master |
| `server/services/salesRepAutoRegister.js` | Auto-register sales reps on upload |
| `server/services/salesRepResolver.js` | Resolve names via aliases for aggregation |
| `src/services/regionService.js` | Database-first region lookups |

### Modified Files
| File | Change |
|------|--------|
| `server/routes/aebf/actual.js` | Calls autoRegisterSalesReps after upload |
| `server/routes/aebf/budget.js` | Calls autoRegisterSalesReps after upload |
| `server/index.js` | Loads alias cache at startup |
| `src/contexts/CurrencyContext.js` | Loads region cache at startup |
| `src/components/reports/ExecutiveSummary.js` | Uses regionService |
| `src/components/dashboard/ReactGlobe.js` | Uses regionService |
| `src/components/dashboard/SalesCountryChart.js` | Uses regionService |

---

## Database Statistics After Changes

| Table | Before | After |
|-------|--------|-------|
| `master_countries` | 107 | 199 |
| `currencies` | 73 | 129 |
| `sales_rep_master` | 51 | 51 (auto-grows on upload) |
| `sales_rep_aliases` | 0 | 0 (populated via UI) |

---

## Maintenance Notes

### Restart Required?
- Backend changes: **AUTO-RESTART** (node --watch)
- Frontend changes: **HOT-RELOAD** (auto)
- After running seed scripts: **No restart needed**

### To Add Missing Countries Later
1. Add to `missingCountries` array in `seed-missing-countries.js`
2. Add currency to `missingCurrencies` if it's a new currency
3. Run: `node scripts/seed-missing-countries.js`

### To Populate Sales Rep Aliases
1. Go to Settings → Master Data → Sales Rep Management
2. Click on a sales rep to edit
3. Add aliases (alternate spellings)
4. The system will aggregate data across all aliases

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                          │
├────────────────────────────────────────────────────────────────┤
│  CurrencyContext.js ─────► regionService.js (cache)            │
│       │                         │                              │
│       │ loads                   │ provides                     │
│       ▼                         ▼                              │
│  fetchCountries()         getRegionForCountry()                │
│       │                         │                              │
└───────┼─────────────────────────┼──────────────────────────────┘
        │                         │
        ▼                         ▼
┌───────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js)                         │
├───────────────────────────────────────────────────────────────┤
│  /api/countries/list          salesRepResolver.js (cache)      │
│       │                             │                          │
│       │                             │ resolves aliases         │
│       ▼                             ▼                          │
│  master_countries           sales_rep_master + aliases         │
└───────────────────────────────────────────────────────────────┘
        │                             │
        ▼                             ▼
┌───────────────────────────────────────────────────────────────┐
│                    DATABASE (PostgreSQL)                       │
├───────────────────────────────────────────────────────────────┤
│  ip_auth_database:          fp_database:                       │
│  - master_countries (199)   - sales_rep_master (51)            │
│  - currencies (129)         - sales_rep_aliases (0)            │
│  - country_aliases (32)     - sales_rep_groups (6)             │
│  - exchange_rates (28)      - sales_rep_group_members          │
└───────────────────────────────────────────────────────────────┘
```

---

*Document created: December 24, 2025*
*Author: GitHub Copilot (Claude Opus 4.5)*
