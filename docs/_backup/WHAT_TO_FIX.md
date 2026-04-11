# IPD 10-12 - Issues To Fix

> **Last Updated:** December 20, 2025  
> **Strategy:** Fix issues gradually during normal development, not all at once

---

## ✅ FIXED

| Date | Issue | File | Status |
|------|-------|------|--------|
| 2025-12-20 | Redundant bodyParser.json() | server/config/express.js | ✅ Fixed |
| 2025-12-20 | Unused bodyParser import | server/config/express.js | ✅ Fixed |
| 2025-12-20 | Missing auth on admin routes | server/routes/admin.js | ✅ Fixed |
| 2025-12-20 | Updated .env.example | server/.env.example | ✅ Fixed |

---

## 🔴 CRITICAL (Fix When Touching These Files)

### 1. SQL Injection - Division Validation
**Files:** `server/routes/universal.js`, `server/routes/divisionMergeRules.js`  
**Issue:** Table names constructed from user input without validation  
**Fix:** Add division whitelist before database queries:
```javascript
const VALID_DIVISIONS = ['FP', 'HC'];
if (!VALID_DIVISIONS.includes(division.toUpperCase())) {
  return res.status(400).json({ error: 'Invalid division' });
}
```
**When:** When adding new divisions or editing these routes

---

## 🟠 HIGH PRIORITY (Fix During Related Work)

### 2. Duplicate Database Config Files
**Files:** 
- `server/config/database.js` (incomplete, hardcoded values)
- `server/database/config.js` (complete, has authPool, getDivisionPool)

**Issue:** Two configs with different settings cause confusion  
**Fix:** Consolidate to single file (`server/database/config.js`)  
**When:** When refactoring database layer or adding new modules

---

### 3. Console.log Instead of Logger (Backend)
**Files:** `server/utils/divisionDatabaseManager.js` (30+ occurrences)  
**Issue:** Inconsistent logging, no log level control  
**Fix:** Replace `console.log` with `logger.info/debug/warn/error`  
**When:** When editing divisionDatabaseManager.js

---

### 4. Frontend Hardcoded URLs
**Files:** Multiple components use `http://localhost:3001` directly  
**Issue:** Will break in production  
**Fix:** Create `src/config/api.js`:
```javascript
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
```
**When:** Before production deployment

---

### 5. Frontend Console.log Statements
**Files:** Contexts, components (100+ occurrences)  
**Issue:** Leaks debug info, clutters browser console  
**Fix:** Create conditional logger or remove  
**When:** When editing each context/component

---

## 🟡 MEDIUM PRIORITY (Nice to Have)

### 6. Missing useEffect Cleanup
**Files:** 
- `src/contexts/ExcelDataContext.js`
- `src/contexts/FilterContext.js`
- `src/contexts/SalesDataContext.js`
- `src/contexts/CurrencyContext.js`

**Issue:** Async calls without AbortController can cause memory leaks  
**Fix:** Add cleanup function:
```javascript
useEffect(() => {
  const controller = new AbortController();
  fetchData({ signal: controller.signal });
  return () => controller.abort();
}, [deps]);
```
**When:** When React shows "state update on unmounted component" warning

---

### 7. Inconsistent Error Response Format
**Issue:** Some routes return `{ error }`, others `{ success, error }`, others `{ message }`  
**Fix:** Standardize to `{ success: boolean, error?: string, data?: any }`  
**When:** When creating new routes (follow new standard)

---

### 8. Missing Error Boundaries (Frontend)
**Issue:** Component crash = entire app crash  
**Fix:** Create ErrorBoundary component and wrap major sections  
**When:** Before production deployment

---

### 9. Inconsistent API Client (Frontend)
**Issue:** Mix of axios (with interceptors) and native fetch (without auth)  
**Fix:** Use single API client with automatic auth headers  
**When:** When refactoring services layer

---

## 🟢 LOW PRIORITY (Code Quality)

### 10. Missing PropTypes/TypeScript
**Issue:** No type checking on React components  
**When:** Consider for major refactor or new project

---

### 11. Large Context Files
**Files:** `FilterContext.js` (587 lines), chart components (1000+ lines)  
**When:** When adding features to these files, consider splitting

---

### 12. Division Pool Error Handlers
**File:** `server/utils/divisionDatabaseManager.js`  
**Issue:** Division pools created without error handlers  
**Fix:** Add `pool.on('error', ...)` like main pool  
**When:** When editing divisionDatabaseManager.js

---

## 📝 Notes

- **Don't fix everything at once** - causes more bugs
- **Fix while you're already there** - during feature development
- **Test after each fix** - verify nothing broke
- **Update this file** - mark items as fixed with date

